export type Role="student"|"admin"|"staff";
export type Status="Submitted"|"Under Review"|"Assigned"|"In Progress"|"Resolved"|"Closed"|"Reopened"|"Escalated";
export type Priority="Low"|"Medium"|"High"|"Critical";
export interface Complaint {id:string;complaint_number:string;student_name:string;register_number:string|null;department:string|null;mobile_number:string|null;title:string;description:string;category:string;building:string|null;floor:string|null;location:string;severity:Priority;affected_people:number|null;calculated_priority:Priority;priority:Priority;priority_reason:string;status:Status;assigned_staff_id:string|null;submitted_at:string;due_at:string|null;resolved_at:string|null;closed_at:string|null;}
export interface Profile {id:string;full_name:string;email:string;role:Role;department_id:string|null;}
