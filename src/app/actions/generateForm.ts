"use server";

import { auth } from "@/auth";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { saveForm } from "./mutateForm";

function cleanApiResponse(jsonResponse: string) {
  let cleanedResponse = jsonResponse
    .replace(/\/\/.*\n/g, "") // Remove single-line comments
    .replace(/\/\*[\s\S]*?\*\//g, "") // Remove block comments
    .replace(/<[^>]*>/g, "") // Remove HTML tags
    .replace(/@[^ ]+:/g, "") // Remove npm package references
    .replace(/\\\"/g, '"') // Replace incorrectly escaped characters
    .replace(/\t/g, "") // Remove tabs
    .replace(/,\s*}/g, "}") // Fix trailing commas before closing braces
    .replace(/,\s*]/g, "]") // Fix trailing commas before closing brackets
    .replace(/\n/g, "") // Remove newlines
    .replace(/\s+/g, " ") // Replace multiple whitespace with single space
    .replace(/{\s*"\s*/g, '{"') // Fix spaces in keys
    .replace(/"\s*}/g, '"}') // Fix spaces before closing braces in keys
    .replace(/"\s*:/g, '":') // Fix spaces before colons in keys
    .replace(/:\s*"/g, ':"') // Fix spaces after colons in values
    .replace(/,\s*"/g, ',"') // Fix spaces after commas in values
    .trim(); // Remove whitespace from both ends of a string
  console.log(cleanedResponse);
  try {
    const parsedJson = JSON.parse(cleanedResponse);
    console.log("JSON válido:", parsedJson);
    return parsedJson;
  } catch (error) {
    console.log("Falha ao analisar o JSON:", error);
    return null;
  }
}

const fieldOptionSchema = z.object({
  text: z.string(),
  value: z.string(),
});
const questionSchema = z.object({
  text: z.string(),
  fieldType: z.enum(["RadioGroup", "Select", "Input", "Textarea", "Switch"]),
  fieldOptions: z.array(fieldOptionSchema).optional(),
});
const questionsArraySchema = z.array(questionSchema);
const apiResponseSchema = z.object({
  choices: z.array(
    z.object({
      message: z.object({
        content: questionsArraySchema,
      }),
    })
  ),
});

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
    "Com base na descrição fornecida, gere uma pesquisa com um array de perguntas onde cada elemento possui 2 campos: text e fieldType. O campo fieldType pode ser uma das seguintes opções: RadioGroup, Select, Input, Textarea ou Switch. Para os tipos RadioGroup e Select, também retorne um array fieldOptions com os campos text e value. Por exemplo, para os tipos RadioGroup e Select, o array de opções de campo pode ser [{text: 'Sim', value: 'sim'}, {text: 'Não', value: 'não'}], e para os tipos Input, Textarea e Switch, o array de opções de campo pode estar vazio. Por exemplo, para os tipos Input, Textarea e Switch, o array de opções de campo pode ser []. Retorne a pesquisa em formato JSON sem usar markdown para json, em português do Brasil e sem incluir comentários (//).";

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
              role: "user",
              content: `${data.description} ${promptExplanation}`,
            },
          ],
        }),
      }
    );

    const json = await response.json();
    console.log(json);
    // Chame a função de limpeza aqui
    const cleanedResponse = cleanApiResponse(JSON.stringify(json));
    console.log(cleanedResponse);

    // Certifique-se de que 'cleanedResponse' não é nulo antes de continuar
    if (!cleanedResponse) {
      throw new Error("Failed to clean API response");
    }

    // Valide a resposta da API aqui
    const parseResult = apiResponseSchema.safeParse(cleanedResponse);
    if (!parseResult.success) {
      console.log(parseResult.error);
      throw new Error("Failed to parse API response");
    }

    // Se a validação for bem-sucedida, continue com o fluxo
    const questionsData = parseResult.data.choices[0].message.content;

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
