import { GuideView } from "../guide-view";
import { guide } from "@/lib/guides";

export default function Page() {
  return <GuideView guide={guide("serum-for-combination-skin")} />;
}
