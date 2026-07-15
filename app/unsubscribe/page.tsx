import { UnsubscribeForm } from "./unsubscribe-form";

export default async function UnsubscribePage({ searchParams }: { searchParams: Promise<{ token?: string | string[] }> }) {
  const value = (await searchParams).token;
  return <UnsubscribeForm token={typeof value === "string" ? value : ""} />;
}
