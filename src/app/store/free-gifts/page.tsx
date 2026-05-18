import type { Metadata } from "next";
import { StoreFreeGiftsGame } from "@/components/store/game/StoreFreeGiftsGame";

export const metadata: Metadata = {
  title: "هدايا مجانية | FitZone Store",
  description: "العب واربح هدايا مجانية من متجر فيت زون",
};

export default function FreeGiftsPage() {
  return <StoreFreeGiftsGame />;
}
