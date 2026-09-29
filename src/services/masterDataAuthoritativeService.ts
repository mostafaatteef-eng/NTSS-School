import type { MasterDataItem, User } from '../types';
import { postgresApiRequest } from './backend/postgresRuntime';

type Result = { success:boolean; code?:string; message?:string; available?:boolean; data?:MasterDataItem[]; item?:MasterDataItem };

const context = (user: User | null) => ({
  token:String((user as any)?.sessionToken||'').trim(),
  schoolId:String((user as any)?.activeSchoolId||(user as any)?.schoolId||'').trim(),
});

async function post(user: User | null, action:string, data?:Record<string,unknown>):Promise<Result>{
  const {token,schoolId}=context(user);
  if(!user||!token)return {success:false,code:'AUTH_REQUIRED'};
  if(!schoolId)return {success:false,code:'SCHOOL_CONTEXT_REQUIRED'};
  const response=await postgresApiRequest<any>('/master-data/manage',token,{method:'POST',body:JSON.stringify({action,schoolId,data})});
  const body=response.body||{};
  if(!response.ok||body.status!=='success')return {success:false,code:body.code||`HTTP_${response.status}`,message:body.message};
  return {success:true,available:body.available,data:Array.isArray(body.data)?body.data:undefined,item:body.data&&!Array.isArray(body.data)?body.data:undefined};
}

export const masterDataAuthoritativeService={
  capability:(user:User|null)=>post(user,'capability'),
  list:(user:User|null)=>post(user,'list'),
  save:(user:User|null,item:Partial<MasterDataItem>)=>post(user,'save',item as Record<string,unknown>),
  toggle:(user:User|null,id:string)=>post(user,'toggle',{id}),
};
