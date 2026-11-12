# Allerte meteo (Protezione Civile) in formato compatto

`allerte.json` contiene l'ultimo **bollettino di criticità** del Dipartimento della Protezione Civile
(allerta gialla / arancione / rossa per temporali, rischio idrogeologico e idraulico, per oggi e domani,
156 zone di allerta), con i contorni delle zone semplificati (~400 m).

- Fonte: [pcm-dpc/DPC-Bollettini-Criticita-Idrogeologica-Idraulica](https://github.com/pcm-dpc/DPC-Bollettini-Criticita-Idrogeologica-Idraulica) — licenza **CC BY 4.0**, © Dipartimento della Protezione Civile.
- Aggiornamento: GitHub Actions ogni 30 minuti (`scripts/genera.mjs`); il file cambia solo quando esce un bollettino nuovo.
- Indirizzo per le app: `https://raw.githubusercontent.com/Guidri/allerte-meteo/main/allerte.json`

Formato: `{ formato, id, nome, emesso, generato, fonte, giorni: { "AAAA-MM-GG": [ { nome, livello 0-3, rischi: [{tipo, livello}], poligoni: [[[lon,lat],...]] } ] } }`

Le allerte ufficiali restano quelle pubblicate da Protezione Civile e Regioni: questo file serve solo a mostrarle nelle app.
