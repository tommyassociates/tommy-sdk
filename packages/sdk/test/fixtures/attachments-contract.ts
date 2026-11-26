import type { ActionsApi, HostApi, KeptAttachment, AttachmentInfo, QueuedWriteReceipt } from '../../src/types.js';

declare const actions: ActionsApi;
declare const host: HostApi;
declare const picked: Blob[];

export async function submitWithFiles(): Promise<void> {
  const kept: KeptAttachment[] = await host.attachments.keep(picked, { activity: 'submit_document' });
  await actions.invoke('documents.submit_document', { documentTypeId: '7', files: kept }, { idempotencyKey: 'k', summary: 'Police check' });
  const info: AttachmentInfo | null = await host.attachments.info(kept[0].ref);
  const state: 'kept' | 'pinned' | 'refused' | 'expired' | undefined = info?.state;
  const blob: Blob | null = await host.attachments.read(kept[0].ref);
  const dropped: boolean = await host.attachments.drop(kept[0].ref);
  void state; void blob; void dropped;
}

export function receiptFiles(receipt: QueuedWriteReceipt): number {
  const progress: number | null | undefined = receipt.progress;
  const summary: string | undefined = receipt.summary;
  void progress; void summary;
  return (receipt.attachments ?? []).reduce((sum, file) => sum + file.size, 0);
}
