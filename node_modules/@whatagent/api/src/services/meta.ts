import axios from 'axios';

const META_API_BASE = 'https://graph.facebook.com/v21.0';

export interface SendTextMessageParams {
  phoneNumberId: string;
  accessToken: string;
  to: string;
  text: string;
  previewUrl?: boolean;
}

export interface SendTemplateMessageParams {
  phoneNumberId: string;
  accessToken: string;
  to: string;
  templateName: string;
  languageCode: string;
  components?: unknown[];
}

export interface SendImageMessageParams {
  phoneNumberId: string;
  accessToken: string;
  to: string;
  imageUrl: string;
  caption?: string;
}

export interface MetaSendResponse {
  messaging_product: string;
  contacts: Array<{ input: string; wa_id: string }>;
  messages: Array<{ id: string; message_status: string }>;
}

export async function sendTextMessage(params: SendTextMessageParams): Promise<MetaSendResponse> {
  const { phoneNumberId, accessToken, to, text, previewUrl = false } = params;

  const response = await axios.post<MetaSendResponse>(
    `${META_API_BASE}/${phoneNumberId}/messages`,
    {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'text',
      text: { body: text, preview_url: previewUrl },
    },
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    }
  );

  return response.data;
}

export async function sendTemplateMessage(
  params: SendTemplateMessageParams
): Promise<MetaSendResponse> {
  const { phoneNumberId, accessToken, to, templateName, languageCode, components = [] } = params;

  const response = await axios.post<MetaSendResponse>(
    `${META_API_BASE}/${phoneNumberId}/messages`,
    {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'template',
      template: {
        name: templateName,
        language: { code: languageCode },
        components,
      },
    },
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    }
  );

  return response.data;
}

export async function sendImageMessage(params: SendImageMessageParams): Promise<MetaSendResponse> {
  const { phoneNumberId, accessToken, to, imageUrl, caption } = params;

  const response = await axios.post<MetaSendResponse>(
    `${META_API_BASE}/${phoneNumberId}/messages`,
    {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'image',
      image: { link: imageUrl, ...(caption && { caption }) },
    },
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    }
  );

  return response.data;
}

export async function validateCredentials(
  phoneNumberId: string,
  accessToken: string
): Promise<{ valid: boolean; displayPhoneNumber?: string; error?: string }> {
  try {
    const response = await axios.get<{ display_phone_number: string }>(
      `${META_API_BASE}/${phoneNumberId}`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
        params: { fields: 'display_phone_number,verified_name' },
      }
    );
    return { valid: true, displayPhoneNumber: response.data.display_phone_number };
  } catch (err: unknown) {
    const message =
      axios.isAxiosError(err) ? err.response?.data?.error?.message ?? err.message : 'Unknown error';
    return { valid: false, error: message };
  }
}
