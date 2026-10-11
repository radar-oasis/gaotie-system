import type { PatternProvenance } from './provenance';
import { useEffect, useRef, useState } from "react";
import { favoriteImage, type Asset } from "./assetApi";
import "./AssetsPage.css";
interface FavoriteButtonProps {
  projectId: string;
  name: string;
  getImage: () => Promise<string>;
  prompt?: string;
  provenance?: PatternProvenance;
  disabled?: boolean;
  onStatus: (message: string) => void;
  onSaved?: (asset: Asset) => void;
}
export default function FavoriteButton(props: FavoriteButtonProps) {
  return <ProjectFavoriteButton key={props.projectId} {...props} />;
}
function ProjectFavoriteButton({
  projectId,
  name,
  getImage,
  prompt,
  provenance,
  disabled,
  onStatus,
  onSaved,
}: FavoriteButtonProps) {
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const lock = useRef(false);
  const active = useRef(true);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const save = async () => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    try {
      const imageDataUrl = await getImage();
      if (!active.current) return;
      const asset = await favoriteImage({
        projectId,
        name,
        imageDataUrl,
        prompt,
        provenance,
      });
      if (!active.current) return;
      setSaved(true);
      onSaved?.(asset);
      onStatus("已收藏到资产沉淀");
    } catch (e) {
      if (active.current) onStatus(e instanceof Error ? e.message : "收藏失败，请重试");
    } finally {
      lock.current = false;
      if (active.current) setBusy(false);
    }
  };
  return (
    <button
      className="asset-favorite"
      type="button"
      title={saved ? "已收藏到资产沉淀" : "收藏到资产沉淀"}
      aria-label={saved ? "已收藏到资产沉淀" : "收藏到资产沉淀"}
      disabled={disabled || busy}
      aria-pressed={saved}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        void save();
      }}
    >
      {busy ? "…" : saved ? "★" : "☆"}
    </button>
  );
}
