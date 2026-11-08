import { validateFile } from "./domain";
// Snapshot the live FileList before yielding: clearing the file input mutates it.
export async function captureAttachments(
  selected: ArrayLike<File>,
  currentCount: number,
) {
  const files = Array.from(selected);
  if (currentCount + files.length > 10)
    throw new Error("الحد الأقصى عشرة مرفقات للزيارة.");
  await Promise.all(files.map(validateFile));
  return files;
}
