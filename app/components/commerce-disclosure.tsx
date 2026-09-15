"use client";

import { affiliateDisclosureActive } from "@/lib/commerce";
import { t } from "@/lib/i18n/core";

/**
 * The economic-relationship disclosure that sits next to a commerce link.
 *
 * 공정위 「추천·보증 등에 관한 표시·광고 심사지침」 requires the relationship to be
 * disclosed where the recommendation is, not on a policy page, and every Korean
 * affiliate programme repeats it in its own terms — 올리브영's curator terms make a
 * missing disclosure grounds for withholding the payout and suspending the account,
 * so this is a revenue precondition, not only a compliance one.
 *
 * Two states, because the honest sentence today is not the honest sentence after
 * signup: ARU carries no affiliate id yet and earns nothing from these links, and
 * claiming a commission it does not take would be its own false statement. The
 * switch is `affiliateDisclosureActive()`.
 */
export function CommerceDisclosure({ style }: { style?: React.CSSProperties }) {
  return (
    <p style={{ ...disclosure, ...style }}>
      {affiliateDisclosureActive()
        ? t("판매처로 이동하는 제휴 링크예요. 구매가 이뤄지면 ARU가 수수료를 받아요. 가격은 달라지지 않아요.")
        : t("판매처로 이동하는 링크예요. ARU는 이 링크로 수수료를 받지 않아요.")}
    </p>
  );
}

const disclosure: React.CSSProperties = {
  fontSize: 11.5,
  color: "var(--text-muted)",
  lineHeight: 1.45,
  marginTop: 8,
};
