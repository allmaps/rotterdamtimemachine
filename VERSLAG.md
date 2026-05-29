# Verslag Rotterdam Tijdmachine

## 3. Kaartviewer – Basisopzet

### 3.1 Historische kaart laden via Allmaps

De Allmaps Plugin voor MapLibre maakt het mogelijk om gedigitaliseerde historische kaarten te laden via georeferentie-annotaties. Per kaart is een annotatie-URL opgeslagen in data.ts. Bij het selecteren van een kaart wordt de WarpedMapLayer gecleared en opnieuw geladen met de nieuwe annotatie. De kaarten zijn afkomstig van instellingen zoals het Stadsarchief Rotterdam, het Nationaal Archief en de Rijksdienst voor Cultureel Erfgoed.

In het navigatiepaneel is een slider toegevoegd waarmee de gebruiker de transparantie van de historische kaartlaag kan aanpassen. Dit maakt het mogelijk om de historische kaart te vergelijken met de moderne ondergrond. De waarde wordt opgeslagen in de globale viewState store.

### 3.2 Kaartcollectie en navigatiepaneel

Er is een zijpaneel gebouwd (Nav.svelte) waarmee de gebruiker kan wisselen tussen historische kaarten. De kaarten worden weergegeven in een lijst met het jaar en een korte naam. Het actieve jaar wordt bijgehouden via een $state variabele, zodat de geselecteerde kaart visueel gemarkeerd wordt. Bij het klikken op een kaart wordt de bijbehorende annotatie geladen op de kaart.
