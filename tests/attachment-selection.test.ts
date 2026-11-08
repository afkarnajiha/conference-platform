import { it, expect, vi } from "vitest";
const mock = vi.hoisted(() => ({ validate: vi.fn() }));
vi.mock("../src/domain", () => ({ validateFile: mock.validate }));
import { captureAttachments } from "../src/attachment-selection";
it("retains selected files when the live input FileList is cleared while validation runs", async () => {
  let complete!: () => void;
  mock.validate.mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        complete = resolve;
      }),
  );
  const file = new File(["%PDF-1.7"], "attachment.pdf", {
    type: "application/pdf",
  });
  const live: { [n: number]: File; length: number } = { 0: file, length: 1 };
  const pending = captureAttachments(live, 0);
  delete live[0];
  live.length = 0;
  complete();
  expect(await pending).toEqual([file]);
});
it("enforces the total attachment limit before validating", async () => {
  await expect(
    captureAttachments([new File(["x"], "x.pdf")], 10),
  ).rejects.toThrow("عشرة");
});
