// The key is GONE from the frontend. We now call an n8n webhook that holds
// the Gemini key server-side. The proxy URL is NOT a secret — safe to ship.
const PROXY_URL = import.meta.env.VITE_GEMINI_PROXY_URL

const MODEL = 'gemini-3.5-flash'

export interface ExtractedCard {
  companyName: string
  contactName: string
  role: string
  email: string
  phone: string
  location: string
  website: string
}

export interface ActivityDraft {
  summary: string
}

// Single place that talks to n8n. Sends { model, payload } where payload is
// the exact Gemini generateContent body. n8n injects the key and forwards it.
async function callGemini(payload: unknown): Promise<any> {
  const response = await fetch(PROXY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: MODEL, payload }),
  })

  if (!response.ok) {
    throw new Error(`Gemini proxy error: ${response.status}`)
  }

  return response.json()
}

// Convert image file to base64
export async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      // Strip the data:image/...;base64, prefix
      resolve(result.split(',')[1])
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

// Extract business card details from image
export async function extractBusinessCard(file: File): Promise<ExtractedCard> {
  const base64 = await fileToBase64(file)
  const mimeType = file.type || 'image/jpeg'

  const data = await callGemini({
    contents: [{
      parts: [
        {
          inline_data: {
            mime_type: mimeType,
            data: base64,
          },
        },
        {
          text: `Extract contact information from this business card image.
Return ONLY a raw JSON object with no markdown, no code blocks, no explanation.
Start your response with { and end with }.

Required format:
{
  "companyName": "full company name",
  "contactName": "person full name",
  "role": "job title",
  "email": "email address",
  "phone": "primary phone number",
  "location": "city and state",
  "website": "website if present"
}

Use empty string "" for any field not visible on the card.
Do not include any text before or after the JSON object.`,
        },
      ],
    }],
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 2000,
    },
  })

  const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}'

  console.log('Gemini raw response:', text)

  let clean = text.trim()
  clean = clean.replace(/^```json\s*/i, '')
  clean = clean.replace(/^```\s*/i, '')
  clean = clean.replace(/\s*```$/i, '')
  clean = clean.trim()

  // If JSON is incomplete, try to close it
  const openBraces = (clean.match(/\{/g) || []).length
  const closeBraces = (clean.match(/\}/g) || []).length
  if (openBraces > closeBraces) {
    clean = clean + '}'.repeat(openBraces - closeBraces)
  }

  const jsonMatch = clean.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('No JSON found in response')

  try {
    return JSON.parse(jsonMatch[0])
  } catch {
    // Last resort — return whatever fields we got
    const result: ExtractedCard = {
      companyName: '', contactName: '', role: '',
      email: '', phone: '', location: '', website: '',
    }
    const fields = ['companyName', 'contactName', 'role', 'email', 'phone', 'location', 'website']
    for (const field of fields) {
      const match = clean.match(new RegExp(`"${field}":\\s*"([^"]*)"`))
      if (match) result[field as keyof ExtractedCard] = match[1]
    }
    return result
  }
}

// Draft activity summary using lead context
export async function draftActivitySummary(params: {
  activityType: string
  companyName: string
  contactName: string
  contactRole: string
  stage: string
}): Promise<string> {
  const data = await callGemini({
    contents: [{
      parts: [{
        text: `You are a B2B sales assistant helping log a CRM activity.

Context:
- Activity type: ${params.activityType}
- Company: ${params.companyName}
- Contact: ${params.contactName}, ${params.contactRole}
- Deal stage: ${params.stage}

Write a concise, professional activity summary (2-4 sentences) for a ${params.activityType} with this contact.
Cover what likely happened, key points discussed, and the general outcome.
Write in past tense, first person plural ("We discussed...").
Return only the summary text, no extra formatting.`,
      }],
    }],
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 200,
    },
  })

  return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? ''
}