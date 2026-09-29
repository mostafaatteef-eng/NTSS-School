import type { AppNotification, User } from '../types';
import { postgresApiRequest } from './backend/postgresRuntime';

type Result={success:boolean;available?:boolean;data?:AppNotification[];code?:string;message?:string};
const ctx=(user:User|null)=>({token:String((user as any)?.sessionToken||'').trim(),schoolId:String((user as any)?.activeSchoolId||(user as any)?.schoolId||'').trim()});
async function post(user:User|null,action:string,extra:Record<string,unknown>={}):Promise<Result>{
  const {token,schoolId}=ctx(user);
  if(!user||!token)return {success:false,code:'AUTH_REQUIRED'};
  if(!schoolId)return {success:false,code:'SCHOOL_CONTEXT_REQUIRED'};
  const r=await postgresApiRequest<any>('/notifications/manage',token,{method:'POST',body:JSON.stringify({action,schoolId,...extra})});
  const b=r.body||{};
  if(!r.ok||b.status!=='success')return {success:false,code:b.code||`HTTP_${r.status}`,message:b.message};
  return {success:true,available:b.available,data:Array.isArray(b.data)?b.data:undefined};
}
export const notificationAuthoritativeService={
  capability:(user:User|null)=>post(user,'capability'),
  list:(user:User|null)=>post(user,'list'),
  markRead:(user:User|null,id:string)=>post(user,'read',{id}),
  markAllRead:(user:User|null)=>post(user,'read-all'),
  delete:(user:User|null,id:string)=>post(user,'delete',{id}),
};
