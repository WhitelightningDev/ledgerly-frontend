import ReceiptDetailClient from "./receipt-detail-client";

export default async function ReceiptDetailPage({
  params,
}: {
  params: Promise<{ receiptId: string }>;
}) {
  const { receiptId } = await params;
  return <ReceiptDetailClient receiptId={receiptId} />;
}

