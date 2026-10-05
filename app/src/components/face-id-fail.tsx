import { ScanFace } from "lucide-react";

export function FaceIdFail({ className }: { className?: string }) {
  return (
    <div className={className} role="status" aria-label="Face ID failed">
      <div className="lf-face-id-fail flex flex-col items-center">
        <ScanFace className="size-16 text-white" strokeWidth={1.5} aria-hidden />
      </div>
    </div>
  );
}
