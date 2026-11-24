// Demó kérdések (AI nélkül kipróbáláshoz). Az első válasz a helyes.
window.DEMO_KERDESEK = [
  ['Melyik szín nem szerepel a magyar zászlón?', ['Fekete', 'Piros', 'Fehér', 'Zöld']],
  ['Hány húrja van egy hagyományos gitárnak?', ['6', '4', '5', '8']],
  ['Melyik a Naprendszer legnagyobb bolygója?', ['Jupiter', 'Szaturnusz', 'Neptunusz', 'Föld']],
  ['Ki írta az Egri csillagokat?', ['Gárdonyi Géza', 'Jókai Mór', 'Mikszáth Kálmán', 'Móricz Zsigmond']],
  ['Melyik folyó folyik át Budapesten?', ['Duna', 'Tisza', 'Dráva', 'Rába']],
  ['Melyik városban áll az Eiffel-torony?', ['Párizs', 'London', 'Róma', 'Madrid']],
  ['Mi a víz kémiai képlete?', ['H2O', 'CO2', 'NaCl', 'O2']],
  ['Ki festette a Mona Lisát?', ['Leonardo da Vinci', 'Michelangelo', 'Raffaello', 'Rembrandt']],
  ['Melyik évben ért véget a második világháború Európában?', ['1945', '1944', '1946', '1939']],
  ['Melyik elem vegyjele az Au?', ['Arany', 'Ezüst', 'Alumínium', 'Argon']],
  ['Ki volt az első ember a világűrben?', ['Jurij Gagarin', 'Neil Armstrong', 'Alekszej Leonov', 'Buzz Aldrin']],
  ['Melyik országban található a Machu Picchu?', ['Peru', 'Mexikó', 'Chile', 'Kolumbia']],
  ['Ki szerezte a Hunyadi László című operát?', ['Erkel Ferenc', 'Liszt Ferenc', 'Kodály Zoltán', 'Bartók Béla']],
  ['Hány kromoszómája van egy egészséges embernek?', ['46', '44', '48', '23']],
  ['Melyik évben avatták fel a budapesti Lánchidat?', ['1849', '1867', '1838', '1896']],
].map(([kerdes, valaszok]) => ({ kerdes, valaszok, magyarazat: '' }));
