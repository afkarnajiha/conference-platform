import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Session } from "@supabase/supabase-js";
import { allRows, client, errorText, supabase, inviteSession } from "./api";
import type { Row } from "./domain";
const tables = [
  "profiles",
  "employees",
  "conferences",
  "conference_assignments",
  "exhibitions",
  "exhibition_qr_codes",
  "visits",
  "visit_reservations",
  "visit_attachments",
  "commercial_opportunities",
  "activity_logs",
] as const;
type Data = Record<(typeof tables)[number], Row[]>;
const blank = () =>
  Object.fromEntries(tables.map((t) => [t, [] as Row[]])) as Data;
function useStateStore() {
  const [session, setSession] = useState<Session | null>(null),
    [ready, setReady] = useState(!supabase),
    [data, setData] = useState<Data>(blank),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [conferenceId, setConferenceId] = useState(
      localStorage.getItem("conference") || "",
    ),
    [recovery, setRecovery] = useState(inviteSession);
  const generation = useRef(0),
    inFlight = useRef(false);
  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data, error }) => {
      setSession(data.session);
      if (error) setError(errorText(error));
      setReady(true);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((event, s) => {
      generation.current++;
      setSession(s);
      setReady(true);
      if (event === "PASSWORD_RECOVERY") setRecovery(true);
      if (!s) {
        setData(blank());
        setRecovery(false);
      }
    });
    return () => listener.subscription.unsubscribe();
  }, []);
  const refresh = useCallback(async () => {
    if (!session || inFlight.current) return;
    inFlight.current = true;
    setLoading(true);
    const gen = generation.current;
    try {
      const results = await Promise.all(
        tables.map((t) =>
          t === "visit_reservations" ? Promise.resolve([]) : allRows(t),
        ),
      );
      if (gen === generation.current) {
        setData(
          Object.fromEntries(tables.map((t, i) => [t, results[i]])) as Data,
        );
        setError("");
      }
    } catch (e) {
      if (gen === generation.current) setError(errorText(e));
    } finally {
      inFlight.current = false;
      setLoading(false);
    }
  }, [session]);
  useEffect(() => {
    if (!session) return;
    void refresh();
    const timer = setInterval(refresh, 30000);
    const channel = client()
      .channel("company-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public" },
        () => void refresh(),
      )
      .subscribe();
    const focus = () => void refresh();
    window.addEventListener("focus", focus);
    return () => {
      clearInterval(timer);
      void client().removeChannel(channel);
      window.removeEventListener("focus", focus);
    };
  }, [session, refresh]);
  useEffect(() => {
    if (!data.conferences.length) return;
    if (!data.conferences.some((c) => c.id === conferenceId))
      setConferenceId(data.conferences[0].id);
  }, [data.conferences, conferenceId]);
  useEffect(
    () => localStorage.setItem("conference", conferenceId),
    [conferenceId],
  );
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(""), 6000);
    return () => clearTimeout(t);
  }, [notice]);
  const profile = data.profiles.find((p) => p.id === session?.user.id),
    conference = data.conferences.find((c) => c.id === conferenceId);
  const run = async (
    fn: () => Promise<unknown>,
    success = "تم حفظ التغييرات بنجاح",
  ) => {
    try {
      await fn();
      await refresh();
      setNotice(success);
      return true;
    } catch (e) {
      setError(errorText(e));
      return false;
    }
  };
  return {
    session,
    ready,
    data,
    loading,
    error,
    setError,
    notice,
    setNotice,
    conferenceId,
    setConferenceId,
    conference,
    profile,
    refresh,
    run,
    recovery,
    setRecovery,
  };
}
const Context = createContext<ReturnType<typeof useStateStore> | null>(null);
export function Store({ children }: { children: ReactNode }) {
  return (
    <Context.Provider value={useStateStore()}>{children}</Context.Provider>
  );
}
export function useStore() {
  const value = useContext(Context);
  if (!value) throw new Error("Store missing");
  return value;
}
