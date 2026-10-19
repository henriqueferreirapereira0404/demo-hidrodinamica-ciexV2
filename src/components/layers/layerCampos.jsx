import { useState, useEffect, useMemo } from "react";
import { Source, Layer, useMap } from "react-map-gl/mapbox";
import { COR_SETA } from "./camadas";
import { VAZIO, caminhoDados, useGeojson } from "./camposTemporais";
import EscalaVetores from "../EscalaVetores";

/* ==================== ESTILOS ==================== */

const CORES_NIVEL = [
  "interpolate",
  ["linear"],
  ["get", "nivel"],
  -0.5, "#440154",
  -0.25, "#443983",
  0.0, "#31688E",
  0.25, "#21908C",
  0.5, "#20A387",
  0.75, "#35B779",
  1.0, "#4EA53B",
  1.25, "#B4DE2C",
  1.5, "#FDE725",
  1.75, "#F8961E",
  2.0, "#DC2F02"
];

// Corrente: velocidade multiplicada por 100 no carregamento (escala 0–200)
const CORES_CORRENTE = [
  "interpolate",
  ["linear"],
  ["get", "velocidade"],
  0, "#2D1E5F",   // 0.0 m/s
  30, "#3B0F70",  // 0.3 m/s
  50, "#2C3E8C",  // 0.5 m/s
  70, "#1F5AA6",  // 0.7 m/s
  100, "#1177B3", // 1.0 m/s
  130, "#1F9E89", // 1.3 m/s
  150, "#35B779", // 1.5 m/s
  170, "#FDE725", // 1.7 m/s
  200, "#DC2F02"  // 2.0 m/s
];

const CORES_VENTO = [
  "interpolate",
  ["linear"],
  ["get", "velocidade"],
  0.0, "#440154",
  5.0, "#2C3E8C",
  10.0, "#1177B3",
  15.0, "#35B779",
  20.0, "#FDE725",
  25.0, "#F8961E",
  30.0, "#DC2F02"
];

// Aumenta o comprimento das setas (1 = tamanho original)
const ESCALA_SETAS = 2;
const PONTOS_TAMANHO = [[3, 10], [5, 14], [7, 18], [10, 24], [15, 48]];

/* ==================== SETAS PROPORCIONAIS À INTENSIDADE ====================
   O comprimento da seta é proporcional à velocidade. Na velocidade de
   referência ela tem o comprimento da tabela PONTOS_TAMANHO (por zoom). */

export const REFERENCIA_SETAS = {
  corrente: { valor: 1, unidade: "m/s" },
  vento: { valor: 10, unidade: "m/s" }
};

// Limites do fator de escala, para setas muito fracas ou muito fortes
const FATOR_MIN = 0.2;
const FATOR_MAX = 2.2;

const ID_ICONE_SETA = "seta-vetor";
const ICONE_LARGURA = 24;
const ICONE_ALTURA = 64;

// Seta apontando para cima (SDF, para colorir com icon-color)
function criarIconeSeta() {
  const canvas = document.createElement("canvas");
  canvas.width = ICONE_LARGURA;
  canvas.height = ICONE_ALTURA;
  const ctx = canvas.getContext("2d");
  const meio = ICONE_LARGURA / 2;
  const cabeca = 18;

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(meio - 1.75, cabeca - 2, 3.5, ICONE_ALTURA - cabeca);
  ctx.beginPath();
  ctx.moveTo(meio, 0);
  ctx.lineTo(ICONE_LARGURA - 2, cabeca);
  ctx.lineTo(2, cabeca);
  ctx.closePath();
  ctx.fill();

  return ctx.getImageData(0, 0, ICONE_LARGURA, ICONE_ALTURA);
}

function tamanhoIcone(tipo) {
  const fator = [
    "min",
    FATOR_MAX,
    ["max", FATOR_MIN, ["/", ["get", "velocidade"], REFERENCIA_SETAS[tipo].valor]]
  ];
  return [
    "interpolate",
    ["linear"],
    ["zoom"],
    ...PONTOS_TAMANHO.flatMap(([zoom, tamanho]) => [
      zoom,
      ["*", (tamanho * ESCALA_SETAS) / ICONE_ALTURA, fator]
    ])
  ];
}

// Registra o ícone da seta no estilo do mapa (e de novo se o estilo recarregar)
function useIconeSeta() {
  const { current: mapa } = useMap();

  useEffect(() => {
    if (!mapa) return;
    const m = mapa.getMap();
    const adicionar = () => {
      if (!m.hasImage(ID_ICONE_SETA)) m.addImage(ID_ICONE_SETA, criarIconeSeta(), { sdf: true });
    };
    const aoFaltar = (e) => {
      if (e.id === ID_ICONE_SETA) adicionar();
    };
    if (m.isStyleLoaded()) adicionar();
    m.on("styleimagemissing", aoFaltar);
    return () => m.off("styleimagemissing", aoFaltar);
  }, [mapa]);
}

/* ==================== AFINAMENTO DAS SETAS ==================== */

const FATOR_ESPACAMENTO = 1.3; // aumente para menos setas, diminua para mais

// Comprimento (px) da seta na velocidade de referência, para o zoom informado
export function tamanhoSetaPx(zoom) {
  const pts = PONTOS_TAMANHO.map(([z, t]) => [z, t * ESCALA_SETAS]);
  if (zoom <= pts[0][0]) return pts[0][1];
  if (zoom >= pts[pts.length - 1][0]) return pts[pts.length - 1][1];
  for (let i = 0; i < pts.length - 1; i++) {
    const [z0, t0] = pts[i];
    const [z1, t1] = pts[i + 1];
    if (zoom >= z0 && zoom <= z1) return t0 + ((zoom - z0) / (z1 - z0)) * (t1 - t0);
  }
  return pts[0][1];
}

// Ponto representativo da feature (Point, ou centro do bbox para outras geometrias)
function coordenadaRepresentativa(geometry) {
  const c = geometry?.coordinates;
  if (!c) return null;
  if (typeof c[0] === "number") return c;

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const percorrer = (a) => {
    if (typeof a[0] === "number") {
      minX = Math.min(minX, a[0]);
      maxX = Math.max(maxX, a[0]);
      minY = Math.min(minY, a[1]);
      maxY = Math.max(maxY, a[1]);
    } else {
      a.forEach(percorrer);
    }
  };
  percorrer(c);
  return Number.isFinite(minX) ? [(minX + maxX) / 2, (minY + maxY) / 2] : null;
}

// Mantém uma seta por célula; a célula é medida em pixels da tela (projeção Mercator do Mapbox)
function afinarPorZoom(geojson, zoom) {
  if (!geojson?.features?.length) return geojson;

  const mundo = 512 * Math.pow(2, zoom);
  const celula = tamanhoSetaPx(zoom) * FATOR_ESPACAMENTO;

  const ocupadas = new Set();
  const features = geojson.features.filter((f) => {
    const c = coordenadaRepresentativa(f.geometry);
    if (!c) return true;

    const x = ((c[0] + 180) / 360) * mundo;
    const s = Math.min(Math.max(Math.sin((c[1] * Math.PI) / 180), -0.9999), 0.9999);
    const y = (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * mundo;

    const chave = `${Math.floor(x / celula)}_${Math.floor(y / celula)}`;
    if (ocupadas.has(chave)) return false;
    ocupadas.add(chave);
    return true;
  });

  return { ...geojson, features };
}

function useZoomDoMapa() {
  const { current: mapa } = useMap();
  const [zoom, setZoom] = useState(5);

  useEffect(() => {
    if (!mapa) return;
    const m = mapa.getMap();
    const atualizar = () => setZoom(Math.round(m.getZoom() * 4) / 4); // passos de 0,25
    atualizar();
    m.on("zoomend", atualizar);
    return () => m.off("zoomend", atualizar);
  }, [mapa]);

  return zoom;
}

const escalarCorrente = (json) => ({
  ...json,
  features: json.features.map((f) => ({
    ...f,
    properties: { ...f.properties, velocidade: f.properties.velocidade * 100 }
  }))
});

/* ==================== COMPONENTE ==================== */

/**
 * Todas as camadas temporais do mapa, sempre montadas na ordem:
 * preenchimento base → malha → setas. A visibilidade é controlada pelo
 * painel, o que garante que as setas fiquem sempre por cima.
 */
export default function LayerCampos({
  fonteDados,
  timeStep,
  camadaBase,
  vetores,
  mostrarMalha,
  onDataHora
}) {
  const url = (prefixo, tipo) => caminhoDados(fonteDados, prefixo, tipo, timeStep);

  const nivel = useGeojson(url("nivel"), camadaBase === "nivel");
  const correnteVel = useGeojson(url("corrente", "velocidade"), camadaBase === "corrente", escalarCorrente);
  const ventoVel = useGeojson(url("vento", "velocidade"), camadaBase === "vento");
  const correnteDir = useGeojson(url("corrente", "direcao"), vetores.corrente);
  const ventoDir = useGeojson(url("vento", "direcao"), vetores.vento);
  const malha = useGeojson("/data/malha.geojson", mostrarMalha);

  // Data/hora do timestep: prioriza a camada base, depois os vetores
  const base = { nivel, corrente: correnteVel, vento: ventoVel }[camadaBase];
  const dataHora =
    base?.dataHora ||
    (vetores.corrente && correnteDir.dataHora) ||
    (vetores.vento && ventoDir.dataHora) ||
    null;

  useEffect(() => {
    onDataHora(dataHora);
  }, [dataHora, onDataHora]);

  // Com as duas direções ativas, a densidade é controlada pelo zoom nos dados
  const ambasDirecoes = vetores.corrente && vetores.vento;
  const zoomMapa = useZoomDoMapa();

  const setasCorrente = useMemo(
    () => (ambasDirecoes ? afinarPorZoom(correnteDir.dados, zoomMapa) : correnteDir.dados),
    [ambasDirecoes, correnteDir.dados, zoomMapa]
  );
  const setasVento = useMemo(
    () => (ambasDirecoes ? afinarPorZoom(ventoDir.dados, zoomMapa) : ventoDir.dados),
    [ambasDirecoes, ventoDir.dados, zoomMapa]
  );

  const visibilidade = (ativo) => (ativo ? "visible" : "none");

  useIconeSeta();

  const layoutSetas = (tipo, ativo) => ({
    visibility: visibilidade(ativo),
    "icon-image": ID_ICONE_SETA,
    "icon-size": tamanhoIcone(tipo),
    "symbol-spacing": 10,
    "symbol-placement": "point",
    "icon-rotate": ["get", "direcao"],
    "icon-rotation-alignment": "map",
    "icon-anchor": "center",
    // Setas mais fortes têm prioridade quando não há espaço para todas
    "symbol-sort-key": ["-", 0, ["get", "velocidade"]],
    // Sem colisão entre as camadas quando as duas estão ativas
    ...(ambasDirecoes ? { "icon-allow-overlap": true, "icon-ignore-placement": true } : {})
  });

  return (
    <>
      <EscalaVetores
        vetores={vetores}
        comprimentoPx={tamanhoSetaPx(zoomMapa)}
        referencias={REFERENCIA_SETAS}
      />

      {/* Camadas base (exclusivas) */}
      <Source id="water-level" type="geojson" data={nivel.dados ?? VAZIO} tolerance={0} buffer={64}>
        <Layer
          id="water-level-layer"
          type="fill"
          layout={{ visibility: visibilidade(camadaBase === "nivel") }}
          paint={{ "fill-color": CORES_NIVEL, "fill-opacity": 0.9, "fill-antialias": false }}
        />
      </Source>

      <Source id="corrente-velocidade" type="geojson" data={correnteVel.dados ?? VAZIO}>
        <Layer
          id="corrente-velocidade-fill"
          type="fill"
          layout={{ visibility: visibilidade(camadaBase === "corrente") }}
          paint={{ "fill-color": CORES_CORRENTE, "fill-opacity": 0.9, "fill-antialias": false }}
        />
      </Source>

      <Source id="vento-velocidade" type="geojson" data={ventoVel.dados ?? VAZIO}>
        <Layer
          id="vento-velocidade-fill"
          type="fill"
          layout={{ visibility: visibilidade(camadaBase === "vento") }}
          paint={{ "fill-color": CORES_VENTO }}
        />
      </Source>

      {/* Malha computacional */}
      <Source id="malha-source" type="geojson" data={malha.dados ?? VAZIO}>
        <Layer
          id="malha-fill"
          type="fill"
          layout={{ visibility: visibilidade(mostrarMalha) }}
          paint={{ "fill-color": "#1d4ed8", "fill-opacity": 0.05 }}
        />
        <Layer
          id="malha-linha"
          type="line"
          layout={{ visibility: visibilidade(mostrarMalha) }}
          paint={{ "line-color": "#1d4ed8", "line-width": 0.5, "line-opacity": 0.4 }}
        />
      </Source>

      {/* Vetores (combináveis) */}
      <Source id="corrente-direcao" type="geojson" data={setasCorrente ?? VAZIO}>
        <Layer
          id="corrente-direcao-setas"
          type="symbol"
          layout={layoutSetas("corrente", vetores.corrente)}
          paint={{ "icon-color": COR_SETA.corrente, "icon-opacity": 1 }}
        />
      </Source>

      <Source id="vento-direcao" type="geojson" data={setasVento ?? VAZIO}>
        <Layer
          id="vento-direcao-setas"
          type="symbol"
          layout={layoutSetas("vento", vetores.vento)}
          paint={{ "icon-color": COR_SETA.vento, "icon-opacity": 1 }}
        />
      </Source>
    </>
  );
}
