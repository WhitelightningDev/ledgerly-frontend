import { redirect } from "next/navigation";

export default async function LegacyReceiptRoute({
  params,
}: {
  params: Promise<{ receiptId: string }>;
}) {
  redirect(`/app/inbox/${(await params).receiptId}`);
}
