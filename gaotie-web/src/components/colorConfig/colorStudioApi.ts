import { apiUrl } from '../../utils/backendUrls';
import type { StudioImage, StudioColor, StudioMessage } from './colorStudio';
export type StudioMode = 'chat' | 'search' | 'palette';
export interface StudioReply { reply: string; images: StudioImage[]; palette?: {name:string; colors:StudioColor[]; rationale:string} }
async function request<T>(path: string, body: unknown, signal: AbortSignal): Promise<T> {
 const form = body instanceof FormData;
 const response = await fetch(apiUrl(`/color-studio/${path}`), {method:'POST',credentials:'include',headers:form?undefined:{'Content-Type':'application/json'},body:form?body:JSON.stringify(body),signal});
 const data = await response.json().catch(()=>null);
 if (!response.ok) throw new Error(typeof data?.message === 'string' ? data.message : `请求失败（${response.status}），请重试`);
 return data as T;
}
export const studioChat = (message:string,context:string[],history:StudioMessage[],mode:StudioMode,candidateColors:string[],signal:AbortSignal) => request<StudioReply>('chat',{message,context,history:history.slice(-12).map(({role,text})=>({role,text:text.slice(0,8000)})),mode,...(candidateColors.length?{candidateColors}:{})},signal);
export const extractStudioColors = (imageUrls:string[],signal:AbortSignal)=>request<{colors:string[];successfulImages?:number;failedImageUrls?:string[]}>('extract',{imageUrls},signal);
export const uploadStudioImage = (file:File,signal:AbortSignal)=>{const data=new FormData();data.append('image',file);return request<{image:StudioImage;colors:string[]}>('upload',data,signal);};
