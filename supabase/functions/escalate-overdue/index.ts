// Deploy as Supabase Edge Function; configure cron via Supabase scheduled functions.
import {createClient} from "https://esm.sh/@supabase/supabase-js@2";
Deno.serve(async(req)=>{
 const auth=req.headers.get("Authorization");
 if(auth!==`Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`) return new Response("Unauthorized",{status:401});
 const client=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
 const {data:rows,error}=await client.from("complaints").select("id,complaint_number,priority,status,student_id,assigned_staff_id,due_at").lt("due_at",new Date().toISOString()).not("status","in",'("Resolved","Closed")');
 if(error)return Response.json({error:error.message},{status:500});
 let escalated=0;
 for(const c of rows??[]){
  const {error:e}=await client.from("escalations").upsert({complaint_id:c.id,escalation_level:c.priority,reason:`Resolution target for ${c.priority} priority exceeded.`,escalated_at:new Date().toISOString()},{onConflict:"complaint_id,escalation_level",ignoreDuplicates:true});
  if(!e){await client.from("complaints").update({status:"Escalated",updated_at:new Date().toISOString()}).eq("id",c.id);if(c.student_id)await client.from("notifications").insert({user_id:c.student_id,title:"Complaint escalated",message:`${c.complaint_number} has exceeded its target and was escalated.`,complaint_id:c.id});escalated++}
 }
 return Response.json({checked:rows?.length??0,escalated});
});