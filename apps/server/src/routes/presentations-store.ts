import { presentationFromTemplate, templateById, type PresentationDoc } from "@roomwave/shared";

import { db } from "../db/database.ts";

export async function insertPresentation(ownerId: string, doc: PresentationDoc): Promise<string> {
  const row = await db
    .insertInto("presentations")
    .values({
      owner_id: ownerId,
      title: doc.title,
      theme: doc.theme,
      slides: JSON.stringify(doc.slides),
    })
    .returning("id")
    .executeTakeFirstOrThrow();
  return row.id;
}

export async function insertFromTemplate(ownerId: string, templateId: string): Promise<string> {
  const template = templateById(templateId) ?? templateById("blank")!;
  return insertPresentation(ownerId, presentationFromTemplate(template));
}
