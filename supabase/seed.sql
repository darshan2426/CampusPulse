-- Demo seed: safe reference departments only. Create demo users through Auth dashboard/CLI,
-- then set roles with a trusted SQL editor/admin bootstrap workflow.
insert into departments(department_name,description) values
('Electronics and Communication Engineering','ECE department'),
('Computer Science and Engineering','CSE department'),
('Information Technology','IT department'),
('Electrical and Electronics Engineering','EEE department'),
('Mechanical Engineering','Mechanical department'),
('Civil Engineering','Civil department'),
('AI & Data Science','AI and data science department')
on conflict(department_name) do nothing;
-- Admin bootstrap example (execute only from trusted SQL console, replacing UUID):
-- update public.profiles set role='admin' where id='AUTH_USER_UUID';
