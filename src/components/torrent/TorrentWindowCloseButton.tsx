import { X } from "lucide-react";

interface Props {
  title: string;
  onClose: () => void;
  className?: string;
  size?: number;
}

export function TorrentWindowCloseButton({ title, onClose, className, size }: Props) {
  return (
    <button type="button" title={title} aria-label={title} className={className} onClick={onClose}>
      <X size={size} />
    </button>
  );
}
