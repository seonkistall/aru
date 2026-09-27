import { GuideView } from "../guide-view";
import { guide } from "@/lib/guides";

export default function Page() {
  return <GuideView guide={guide("toner-for-oily-skin")} />;
}
