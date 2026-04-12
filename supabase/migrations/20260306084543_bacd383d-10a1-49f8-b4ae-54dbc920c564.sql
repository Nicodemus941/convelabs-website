-- Link Nico (user_id 509a4e96-42fa-4121-84ec-4ee484f2a5b2) to the phlebotomist staff_profile
UPDATE staff_profiles 
SET user_id = '509a4e96-42fa-4121-84ec-4ee484f2a5b2' 
WHERE id = 'ba132e34-233b-48d3-b980-cdb40f628782';

-- Delete orphan phlebotomist staff_profiles with null user_ids
DELETE FROM staff_profiles 
WHERE id IN ('ade4a633-46a4-4de5-99c2-faaa40d8a838', '8eb067b2-4e78-4fd0-881e-47be6e348a7b');