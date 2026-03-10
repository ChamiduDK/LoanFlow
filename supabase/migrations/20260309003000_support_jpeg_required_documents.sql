alter table public.required_documents
  alter column accepted_formats
  set default array['pdf', 'jpg', 'jpeg', 'png']::text[];

update public.required_documents
set accepted_formats = (
  select array_agg(distinct format order by format)
  from unnest(
    case
      when accepted_formats && array['jpg', 'jpeg', 'png']::text[]
        then accepted_formats || array['jpg', 'jpeg', 'png']::text[]
      else accepted_formats
    end
  ) as formats(format)
)
where accepted_formats is not null;
