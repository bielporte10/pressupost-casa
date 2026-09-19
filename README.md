# Pressupost de casa

Aplicació web per portar el pressupost familiar entre diverses persones:
límits per categoria, butxaca personal per a cadascú i un objectiu d'estalvi
mensual. Tothom apunta des del seu mòbil i tots veuen el mateix a l'instant.

Sense servidor propi: pàgina estàtica a GitHub Pages i
[Supabase](https://supabase.com) (gratuït) per a les dades.

---

## Com està protegit

Aquest repositori és públic, però **les dades no ho són**. Val la pena
entendre per què, perquè és contraintuïtiu:

**La clau `anonKey` de `config.js` és pública per disseny.** Va dins de
qualsevol aplicació web feta amb Supabase i qualsevol la pot llegir mirant el
codi font. No és un descuit i no cal amagar-la: **per si sola no dona accés a
res**.

Qui protegeix les dades és el **Row Level Security** de
[`supabase-setup.sql`](supabase-setup.sql). Amb RLS activat, la base de dades
no retorna cap fila si no es compleix una política, i les polítiques diuen:

| | |
|---|---|
| Sense sessió iniciada | 0 files, sempre — el rol públic no té permís sobre cap taula |
| Amb sessió d'una altra llar | 0 files de la teva |
| Amb sessió de casa | només les files de casa |

A més, cadascú només pot crear moviments **a nom seu** i esborrar **els seus**,
i només pot modificar **la seva pròpia** fitxa de membre.

> **L'única clau que no ha de sortir mai d'aquí** és la `service_role` de
> Supabase, que sí que se salta el RLS. No la posis a `config.js` ni enlloc del
> repositori.

---

## Posar-ho en marxa

### 1. Crear el projecte de Supabase

1. Entra a [supabase.com](https://supabase.com) i crea un compte.
2. **New project**. Tria la regió **Europe** perquè les dades es quedin a la UE.
3. A l'apartat **Security** de la pantalla de creació:
   - **Enable Data API** → marcat *(l'app el necessita)*
   - **Automatically expose new tables** → **desmarcat** *(el SQL ja dona els
     permisos que calen, taula per taula)*
   - **Enable automatic RLS** → **marcat** *(si algun dia s'afegeix una taula,
     neix protegida)*
4. Guarda't la contrasenya de la base de dades que et demana.

### 2. Crear les taules i la seguretat

A Supabase, **SQL Editor → New query**, enganxa-hi tot
[`supabase-setup.sql`](supabase-setup.sql) **fins al punt 6** i prem **Run**.

### 3. Crear els usuaris

**Authentication → Users → Add user → Create new user**, un per persona.
Posa-hi correu i contrasenya i marca *Auto Confirm User*.

**Tanca el registre públic abans de res**: a **Authentication → Sign In /
Providers → Email**, desactiva **Allow new users to sign up**.

Si no ho fas, qualsevol pot crear-se un compte al teu projecte. No veuria cap
dada (no seria membre de cap llar), però et consumiria quota i t'ompliria la
llista d'usuaris.

### 4. Donar-los d'alta a la llar

Torna al SQL Editor, agafa el **bloc 7** del mateix fitxer i executa'l. Crea la
llar, dona d'alta tots els usuaris que existeixin i posa les categories.

**Es pot tornar a executar les vegades que calgui.** El que ja hi ha no es toca.

El bloc porta una **llista blanca de correus**: només dona d'alta els que hi
consten. Per afegir algú, posa'l a la llista i torna a executar-lo. Està fet
així a posta, perquè "dona d'alta tothom que existeixi" seria perillós si
algun dia el registre quedés obert.

### 5. Connectar l'app

A **Project Settings → API** copia:

- **Project URL** → `config.js`, camp `url`
- **anon public** → `config.js`, camp `anonKey`

### 6. Publicar

```bash
git add -A
git commit -m "Configura Supabase"
git push
```

A GitHub: **Settings → Pages → Source: Deploy from a branch → main / (root)**.
Al cap d'un minut la tens a `https://<usuari>.github.io/<repo>/`.

---

## Com es fa servir

**Apuntar una despesa.** Data, categoria, import i, si vols, una nota.
Si la despesa és teva i surt de la teva butxaca, tria **💳 La meva butxaca**.
Si és de casa (el súper, la benzina, el veterinari), tria la categoria que toqui.

**Resum.** Cada categoria amb el seu límit, el que s'ha gastat i el que queda.
Verd fins al 85%, groc fins al 100%, vermell si s'ha passat. A dalt, l'estalvi
del mes: verd si arriba a l'objectiu, vermell si no.

**Persones.** Quant porta gastat cadascú de la seva butxaca i en què.

**Moviments.** Tot el mes, filtrable per persona. Cadascú pot esborrar els seus.

**Ajustos.** Ingressos, fixos, objectiu i els límits de cada categoria. Els
canvis els veuen tots. La teva butxaca i el teu nom només els pots canviar tu.

---

## Com quadren els números

L'estalvi del mes es calcula així:

```
ingressos − despeses fixes − tota la despesa variable = estalvi
```

Les **despeses fixes** són un sol número als ajustos: hipoteca, assegurances,
escola, subministraments i tot el que es paga sí o sí. No s'apunten moviment a
moviment perquè no es decideixen cada mes.

La **despesa variable** és tot el que s'apunta a l'app: les categories de casa
i de família, més les butxaques personals.

> Compte amb comptar dues vegades. Si els diners de butxaca d'algú ja estan
> dins del número de "despeses fixes" (per exemple, una recàrrega mensual fixa
> a una targeta de prepagament), posa-li la butxaca a 0 o treu-ho dels fixos.

---

## Detalls tècnics

| | |
|---|---|
| Frontend | HTML, CSS i JavaScript sense cap framework |
| Dades | Supabase (PostgreSQL) amb Row Level Security |
| Sessions | Supabase Auth, correu i contrasenya |
| Temps real | Supabase Realtime sobre la taula `moviments` |
| Allotjament | GitHub Pages |

Cinc fitxers i cap pas de compilació: s'edita i es puja.

```
index.html           estructura i vistes
styles.css           disseny, amb mode fosc automàtic
app.js               lògica, consultes i pintat
config.js            adreça i clau pública de Supabase
supabase-setup.sql   taules, polítiques de seguretat i dades inicials
```

---

## Coses que encara no fa

- Editar un moviment un cop apuntat (s'esborra i es torna a apuntar).
- Gràfics d'evolució entre mesos.
- Despeses recurrents automàtiques.
- Recuperar la contrasenya des de l'app: de moment es canvia des del panell de
  Supabase.
