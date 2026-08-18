-- Explicitly remove anonymous execution inherited from existing default privileges.
-- Authenticated execution remains intentional; both functions validate auth.uid()
-- and enforce caller ownership/teacher role inside the transaction.

revoke execute on function public.join_class(text, integer, integer, text) from anon;
revoke execute on function public.set_class_president(uuid, uuid) from anon;

grant execute on function public.join_class(text, integer, integer, text) to authenticated;
grant execute on function public.set_class_president(uuid, uuid) to authenticated;
