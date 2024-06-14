"use server";

import { auth } from "@/auth";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { saveForm } from "./mutateForm";
import console from "console";

export async function generateForm(
  prevState: { message: string },
  formData: FormData
) {
  const session = await auth();
  if (!session?.user) redirect("/api/auth/signin");

  const schema = z.object({
    description: z.string().min(1),
  });
  const parse = schema.safeParse({
    description: formData.get("description"),
  });

  if (!parse.success) {
    console.log(parse.error);
    return {
      message: "Failed to parse data",
    };
  }

  if (!process.env.OPENAI_API_KEY) {
    return {
      message: "No OpenAI API key found",
    };
  }

  const data = parse.data;
  const promptExplanation =
    "Based on the description, generate a survey with questions array where every element has 2 fields: text and the fieldType and fieldType can be of these options RadioGroup, Select, Input, Textarea, Switch; and return it in json format. For RadioGroup, and Select types also return fieldOptions array with text and value fields. For example, for RadioGroup, and Select types, the field options array can be [{text: 'Yes', value: 'yes'}, {text: 'No', value: 'no'}) and for Input, Textarea, and Switch types, the field options array can be empty. For example, for Input, Textarea, and Switch types, the field options array can be []. Retorne a enquete em formato JSON, evite usar markdown para json, em BR e não coloque de maneira nenhuma comentários (//).";

  try {
    const response = await fetch(
      "https://api.pawan.krd/pai-001-light/v1/chat/completions",
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.OPENAI_API_KEY ?? ""}`,
        },
        method: "POST",
        body: JSON.stringify({
          model: "gpt-3.5-turbo",
          messages: [
            {
              role: "system",
              content: `${data.description} ${promptExplanation}`,
            },
          ],
        }),
      }
    );

    const json = await response.json();
    console.log(json);
    const content = json.choices[0].message.content;
    const jsonString = content.split("```json\n")[1].split("\n```")[0];
    const questionsData = JSON.parse(jsonString);

    const dbFormId = await saveForm({
      name: "Testing save form",
      description: "Testing save form description",
      questions: questionsData,
    });
    console.log(dbFormId);

    revalidatePath("/");
    return {
      message: "success",
      data: json,
    };
  } catch (e) {
    console.log(e);
    return {
      message: "Failed to create form",
    };
  }
}
