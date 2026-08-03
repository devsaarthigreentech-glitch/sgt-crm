// The key is GONE from the frontend. We now call an n8n webhook that holds
// the Gemini key server-side. The proxy URL is NOT a secret — safe to ship.
const PROXY_URL = import.meta.env.VITE_GEMINI_PROXY_URL

const MODEL = 'gemini-3.5-flash'

/**
 * OFFLINE MODE — set VITE_GEMINI_MOCK=1.
 *
 * Returns fixed sample data without calling the proxy at all, so the
 * capture flow can be clicked through as many times as you like without
 * spending a single request against the daily quota.
 *
 * This exists because the quota that a demo needs is the same quota that
 * rehearsing the demo consumes. Practise in mock, and keep the real
 * requests for the real thing.
 *
 * Build-time, not runtime: Vite inlines it, so a production build with
 * the flag unset cannot fall into mock mode by accident.
 */
const MOCK = String(import.meta.env.VITE_GEMINI_MOCK ?? '') === '1'

/** How long to wait before giving up. A hung scan is worse than a failed one. */
const TIMEOUT_MS = Number(import.meta.env.VITE_GEMINI_TIMEOUT_MS ?? '30000')

const SAMPLE_CARD: ExtractedCard = {
  companyName: 'Cilicant Private Limited',
  contactName: 'R. Deshpande',
  role: 'Head — Projects',
  email: 'r.deshpande@cilicant.example',
  phone: '+91 98220 41122',
  location: 'Pune, Maharashtra',
  website: 'www.cilicant.example',
}

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
  if (!PROXY_URL) {
    throw new Error(
      'Card scanning is not configured on this build — VITE_GEMINI_PROXY_URL is unset. ' +
      'Enter the details by hand.')
  }

  // A scan that hangs looks identical to a broken one, and the person
  // holding the card cannot tell which. Cap it and say so.
  const abort = new AbortController()
  const timer = setTimeout(() => abort.abort(), TIMEOUT_MS)

  let response: Response
  try {
    response = await fetch(PROXY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: MODEL, payload }),
      signal: abort.signal,
    })
  } catch (e: any) {
    if (e?.name === 'AbortError') {
      throw new Error(
        `Card scanning took longer than ${Math.round(TIMEOUT_MS / 1000)}s and was stopped. ` +
        `Try once more, or enter the details by hand.`)
    }
    throw new Error('Could not reach the card-scanning service. Enter the details by hand.')
  } finally {
    clearTimeout(timer)
  }

  if (!response.ok) {
    // 429 is the one that matters in front of an audience: it means the
    // quota is spent, not that anything is broken, and retrying
    // immediately makes it worse. Say which it is.
    if (response.status === 429) {
      throw new Error(
        'Card scanning has hit its rate limit for now. Wait a minute and try again, ' +
        'or enter the details by hand — nothing else is affected.')
    }
    if (response.status >= 500) {
      throw new Error(
        'The card-scanning service is not responding. Enter the details by hand.')
    }
    throw new Error(`Card scanning failed (${response.status}). Enter the details by hand.`)
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
  if (MOCK) {
    console.info('[gemini] mock mode — no request sent, no quota used')
    // Long enough that the spinner is visible, so the mock exercises the
    // same loading states the real call does.
    await new Promise(r => setTimeout(r, 700))
    return { ...SAMPLE_CARD }
  }

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
  if (MOCK) {
    console.info('[gemini] mock mode — no request sent, no quota used')
    await new Promise(r => setTimeout(r, 500))
    return `We spoke with ${params.contactName} (${params.contactRole}) at ` +
      `${params.companyName} regarding their requirement. Discussed the current ` +
      `stage of the opportunity and the commercial terms. The conversation was ` +
      `constructive and a follow-up was agreed.`
  }

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