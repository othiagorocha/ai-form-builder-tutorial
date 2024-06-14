"use server";

import { auth } from "@/auth";
import { db } from "@/db";
import { forms, questions as dbQuestions, fieldOptions } from "@/db/schema";
import { InferInsertModel } from "drizzle-orm";

type Form = InferInsertModel<typeof forms>;
type Question = InferInsertModel<typeof dbQuestions>;
type FieldOption = InferInsertModel<typeof fieldOptions>;

interface SaveFormData extends Form {
  questions: Array<Question & { fieldOptions?: FieldOption[] }>;
}

export async function saveForm(data: SaveFormData) {
  const { name, description, questions } = data;
  const session = await auth();
  const userId = session?.user?.id;

  const newForm = await db
    .insert(forms)
    .values({ name, description, userId, published: false })
    .returning({ insertedId: forms.id });
  const formId = newForm[0].insertedId;

  return formId;
}
