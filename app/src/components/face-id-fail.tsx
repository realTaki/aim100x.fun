import { ScanFace } from "lucide-react";

export function FaceIdFail({
  className,
  label = "Face ID failed",
}: {
  className?: string;
  label?: string;
}) {
  return (
    <div className={className} role="status" aria-label={label}>
      <div className="lf-face-id-fail flex flex-col items-center">
        <ScanFace className="size-16 text-white" strokeWidth={1.5} aria-hidden />
      </div>
    </div>
  );
}
