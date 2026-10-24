alter table users
  add column nickname text
    check (nickname is null or char_length(nickname) between 1 and 32);
