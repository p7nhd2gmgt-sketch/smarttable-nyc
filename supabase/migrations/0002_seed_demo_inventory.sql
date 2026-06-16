-- Optional seed data for local/staging Supabase projects.

insert into public.restaurants (
  id,
  name,
  legal_name,
  contact_email,
  phone,
  address,
  district,
  cuisine,
  description,
  status,
  rating
) values
(
  '10000000-0000-4000-8000-000000000001',
  'Hudson Hearth',
  'Hudson Hearth LLC',
  'reservations@hudsonhearth.example',
  '+1 212 555 0188',
  '128 Perry St, New York, NY 10014',
  'West Village',
  'New American',
  'A polished neighborhood bistro with stronger deals for early and late dinner windows.',
  'approved',
  4.8
),
(
  '10000000-0000-4000-8000-000000000002',
  'Casa Luna Trattoria',
  'Casa Luna Hospitality Inc.',
  'manager@casaluna.example',
  '+1 212 555 0142',
  '242 Mott St, New York, NY 10012',
  'Nolita',
  'Italian',
  'Warm trattoria energy, handmade pasta, and discounted tables between peak turns.',
  'pending',
  4.7
)
on conflict (id) do update set
  name = excluded.name,
  legal_name = excluded.legal_name,
  contact_email = excluded.contact_email,
  phone = excluded.phone,
  address = excluded.address,
  district = excluded.district,
  cuisine = excluded.cuisine,
  description = excluded.description,
  status = excluded.status,
  rating = excluded.rating;

insert into public.offers (
  id,
  restaurant_id,
  offer_date,
  offer_time,
  seat_count,
  reserved_seats,
  discount_percent,
  status
) values
(
  '20000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  current_date,
  '18:00',
  12,
  0,
  25,
  'active'
),
(
  '20000000-0000-4000-8000-000000000002',
  '10000000-0000-4000-8000-000000000001',
  current_date,
  '20:30',
  8,
  0,
  30,
  'active'
)
on conflict (id) do update set
  offer_date = excluded.offer_date,
  offer_time = excluded.offer_time,
  seat_count = excluded.seat_count,
  reserved_seats = excluded.reserved_seats,
  discount_percent = excluded.discount_percent,
  status = excluded.status;
