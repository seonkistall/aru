# WebKit's cap on script-writable storage, and what it does to ARU's return path

Read from WebKit's own source on 2026-09-26 because ARU's entire returning-visitor path
stands on one localStorage key. `ReturnBanner` (`app/components/return-banner.tsx`) shows
only when `hasLastResult()` is true, and that reads `localStorage["aru_last_result"]`
(`lib/last-result.ts`). `/report` and `/care` fall back to the same key in a fresh tab. If
Safari deletes it, an iPhone visitor coming back next week is a first-time visitor again:
no banner, `/report` redirects to `/survey`.

## The source, and why it is this one and not the blog

`webkit.org` is refused by this container's egress proxy. Verbatim, both attempts:

```
curl: (56) CONNECT tunnel failed, response 403
webkit.org http=000
```

So the primary source used here is the implementation itself, in the WebKit repository —
which is more authoritative than the blog post anyway, and, as it turns out, disagrees
with the way the cap is usually summarised.

| file | URL | status | bytes | sha256 |
|---|---|---|---|---|
| `ResourceLoadStatisticsStore.cpp` | `https://raw.githubusercontent.com/WebKit/WebKit/main/Source/WebKit/NetworkProcess/Classifier/ResourceLoadStatisticsStore.cpp` | `http=200` | **175527** | `0881c73d0a61e093991671abfa70b0289323945d3d44ae0b22cbebb6a2958169` |
| `ResourceLoadStatisticsStore.h` | `https://raw.githubusercontent.com/WebKit/WebKit/main/Source/WebKit/NetworkProcess/Classifier/ResourceLoadStatisticsStore.h` | `http=200` | **26484** | `e8728be27979385a8d8d1f468e4459237a038b6aefd51063fe22c5e5d54d5af0` |

Line numbers below are in those two files at those hashes.

## Facts, quoted

**The two windows.** `ResourceLoadStatisticsStore.cpp:73-74`:

```cpp
constexpr unsigned operatingDatesWindowLong { 30 }; // days
constexpr unsigned operatingDatesWindowShort { 7 }; // days
```

**What decides which window applies, and whether removal happens at all.**
`ResourceLoadStatisticsStore.cpp:2832-2852`:

```cpp
bool ResourceLoadStatisticsStore::shouldRemoveAllButCookiesFor(const DomainData& resourceStatistic, bool shouldCheckForGrandfathering)
{
    bool isRemovalEnabled = firstPartyWebsiteDataRemovalMode() != FirstPartyWebsiteDataRemovalMode::None || resourceStatistic.dataRemovalFrequency != DataRemovalFrequency::Never;
    bool isResourceGrandfathered = shouldCheckForGrandfathering && resourceStatistic.grandfathered;

    OperatingDatesWindow window { };
    switch (firstPartyWebsiteDataRemovalMode()) {
    case FirstPartyWebsiteDataRemovalMode::AllButCookies:
        [[fallthrough]];
    case FirstPartyWebsiteDataRemovalMode::None:
        window = resourceStatistic.dataRemovalFrequency == DataRemovalFrequency::Short ? OperatingDatesWindow::Short : OperatingDatesWindow::Long;
        break;
    ...
    return isRemovalEnabled && !isResourceGrandfathered && !hasHadUnexpiredRecentUserInteraction(resourceStatistic, window);
}
```

`firstPartyWebsiteDataRemovalMode()`'s stored default is `AllButCookies`
(`ResourceLoadStatisticsStore.h:426`), so `isRemovalEnabled` is true without anything
being configured:

```cpp
    WebCore::FirstPartyWebsiteDataRemovalMode m_firstPartyWebsiteDataRemovalMode { WebCore::FirstPartyWebsiteDataRemovalMode::AllButCookies };
```

**So the widely-quoted "7 days" is the SHORT window, and it is not the one a plain site
gets.** With the default mode, the window is `Short` (**7**) only when the domain's
`dataRemovalFrequency` is `Short`, and `Long` (**30**) otherwise.
`grep -c "DataRemovalFrequency::Short" ResourceLoadStatisticsStore.cpp` is **7**, and
none of those seven is a second policy: `:275` is a to-string, `:316` and `:320` a parse
and its default, `:2842` the window switch quoted above, `:2051` a comparison and `:2054`
an assignment to a local. Exactly **2** call sites hand it to
`setIsScheduledForAllScriptWrittenStorageRemoval` — `:1371`, and `:2059` through the local
assigned at `:2054` — and both are keyed on the same thing: link decoration from a
prevalent resource. `logCrossSiteLoadWithLinkDecoration`
(`ResourceLoadStatisticsStore.cpp:2050-2059`) sets it when a cross-site navigation to the
domain carried link decoration WebKit did not filter, applied only
`if (isPrevalentResource(fromDomain))`; `:1371` carries the same fact in from a merged
statistic, `if (other.gotLinkDecorationFromPrevalentResource && ...)`. Nothing else in
this file puts a domain in the short window.

**What "removal" removes: script-written storage, cookies kept.**
`ResourceLoadStatisticsStore.cpp:2906-2913` — the all-but-cookies branch appends the
domain to `domainsToDeleteAllScriptWrittenStorageFor` and to no cookie list, unlike the
delete-everything branch above it:

```cpp
        if (shouldRemoveAllWebsiteDataFor(statistic, shouldCheckForGrandfathering)) {
            toDeleteOrRestrictFor.domainsToDeleteAllCookiesFor.append(statistic.registrableDomain);
            toDeleteOrRestrictFor.domainsToDeleteAllScriptWrittenStorageFor.append(statistic.registrableDomain);
        } else {
            if (shouldRemoveAllButCookiesFor(statistic, shouldCheckForGrandfathering)) {
                toDeleteOrRestrictFor.domainsToDeleteAllScriptWrittenStorageFor.append(statistic.registrableDomain);
```

**"Days" are days the browser ran, not calendar days.** The window compares against an
operating-date row, and `includeTodayAsOperatingDateIfNecessary`
(`ResourceLoadStatisticsStore.cpp:3299`) is what adds one. While fewer than `window - 1`
operating dates have been recorded, the window date is `std::nullopt`
(`ResourceLoadStatisticsStore.cpp:3280-3296`) and `hasStatisticsExpired`
(`:3336-3348`) cannot expire anything for that window.

**User interaction is what resets it, and its absence is not neutral.**
`ResourceLoadStatisticsStore.cpp:2813-2826`:

```cpp
bool ResourceLoadStatisticsStore::hasHadUnexpiredRecentUserInteraction(const DomainData& resourceStatistic, OperatingDatesWindow operatingDatesWindow)
{
    if (resourceStatistic.hadUserInteraction && hasStatisticsExpired(resourceStatistic.mostRecentUserInteractionTime, operatingDatesWindow)) {
        // Drop privacy sensitive data if we no longer need it.
        if (operatingDatesWindow == OperatingDatesWindow::Long)
            clearUserInteraction(resourceStatistic.registrableDomain, [] { });
        return false;
    }
    return resourceStatistic.hadUserInteraction;
}
```

A domain with `hadUserInteraction == false` returns false here too, so it satisfies
`shouldRemoveAllButCookiesFor` from the start; the `grandfathered` flag in the same
expression is what holds a newly seen domain back.

**Two exemptions, and one of them is the home-screen web app.**
`ResourceLoadStatisticsStore.cpp:2895-2901`:

```cpp
        // Domains permanently configured to be exempt. This can be home screen web applications, app-bound domains, or similar.
        if (shouldExemptFromWebsiteDataDeletion(statistic.registrableDomain))
            continue;

        // Domains with WebPush that the user interacts with continuously should keep their data.
        if (hasHadRecentWebPushInteraction(statistic))
            continue;
```

and the set it checks (`ResourceLoadStatisticsStore.cpp:786-798`):

```cpp
bool ResourceLoadStatisticsStore::shouldExemptFromWebsiteDataDeletion(const RegistrableDomain& domain) const
{
    return !domain.isEmpty() && domainsExemptFromWebsiteDataDeletion().contains(domain);
}

HashSet<RegistrableDomain> ResourceLoadStatisticsStore::domainsExemptFromWebsiteDataDeletion() const
{
    auto result = m_appBoundDomains.unionWith(m_managedDomains);
    result = result.unionWith(m_persistedDomains);

    if (!m_standaloneApplicationDomain.isEmpty())
        result.add(m_standaloneApplicationDomain);
```

`m_standaloneApplicationDomain` is a single domain with a plain setter
(`ResourceLoadStatisticsStore.h:175`) and this file never calls it, so what sets it is
outside these two files and was not established here.

## What this means for ARU's return path

*Fact, from the quotes above:* if ARU's registrable domain ever ends up exempt or the
visitor keeps interacting inside the window, `aru_last_result` survives; if the domain is
neither exempt nor interacted with for a whole window of browsing days, it is deleted
while cookies on the same domain are not.

*Inference, not measured:* this is milder for ARU than the "7 days" framing suggests. A
visitor who reaches ARU by typing the name, from a bookmark, or from an undecorated link
should fall in the **30**-operating-day bucket, and ARU's flow is nothing but taps — the
survey chips, the capture button, the step tabs — so `hadUserInteraction` will be set on
any visit that gets as far as writing a result. The **7**-day bucket is the one to worry
about, and the path into it is a link-decorated cross-site navigation from a domain
WebKit considers prevalent: that is exactly what a paid ad or a tracked campaign link
looks like. So the channel ARU would buy traffic through is the channel whose returning
visitors lose their saved result first. Not measured here on any device.

*Inference:* the exemption list is the only durable answer, and of its four sets the one
ARU could plausibly reach is `m_standaloneApplicationDomain` — the home-screen web app.
What actually sets it is not in these files, so "install to the home screen and the
record is safe" is a hypothesis, not a finding.

*Fact about ARU, not about WebKit:* nothing in the product reads `LastResult.ts`.
`grep -rn "loadLastResult()\|hasLastResult()" app/ lib/ --include=*.ts --include=*.tsx`
outside `lib/last-result.ts` is **4** lines (`app/components/return-banner.tsx:16`,
`app/report/page.tsx:74`, `app/care/page.tsx:27`, `app/studio/page.tsx:60`), and none of
them reads the field:
`grep -rnE "saved\.ts|loadLastResult\(\)[^;]*\.ts\b|lastResult[^;]*\.ts\b" app/ lib/`
is **0** lines, against the single writer `ts: Date.now()` at `app/report/page.tsx:111`. So
ARU has no idea how old a saved result is and cannot tell a deleted
record from a first visit. The re-engage email is the one channel that does not live in
the browser store, and it is owner-blocked (see BLOCKERS in
[`AUTOPILOT.md`](AUTOPILOT.md)); a cookie would survive where localStorage does not, but
putting the record in a cookie sends it to the server on every request, which is a
different privacy posture and not a plumbing change.

## What this note does not establish

No measurement on a real iPhone or in a real Safari: everything above is read from
source. The revision is `main` on 2026-09-26 at the hashes in the table, not any shipped
iOS version — Safari ships from branches, and what a given iOS carries was not checked.
Whether ARU's domain would be classified prevalent, and what sets
`m_standaloneApplicationDomain`, are both open. The blog post everyone quotes was not
read, because `webkit.org` is refused here.
