import PainelGraficoNivel from "./PainelGraficoNivel";
import LayerVazao from "./layers/layerVazao";
import LineChartVazao from "./LineChartVazao";
import LayerCampos from "./layers/layerCampos";
import { MarcadoresEstacoes, PainelEstacoes } from "./layers/layerEstacoes";
import { formatarData, useDataBase } from "./layers/camposTemporais";
import { ehCenario, ehCampoTemporal, horizonteTimeline } from "./layers/camadas";
import Timeline from "./Timeline";
import LegendaMapa from "./LegendaMapa";
import { useState, useEffect, useRef } from "react";
import Map, { NavigationControl } from "react-map-gl/mapbox";
import "mapbox-gl/dist/mapbox-gl.css";
import { Download } from "lucide-react";
import { X } from 'lucide-react';
import useMediaQuery from "@mui/material/useMediaQuery";
import { useTheme } from "@mui/material/styles";
import { createPortal } from "react-dom";


export default function MapView({
  style,
  estacaoSelecionada,
  setEstacaoSelecionada,
  timeStep,
  setTimeStep,
  painelAberto,
  fonteDados,
  camadaBase,
  vetores,
  mostrarMalha
}) {
  const mapRef = useRef();
  const chartApiRef = useRef(null);
  const chartVazaoRef = useRef(null);

  const [rioSelecionado, setRioSelecionado] = useState(null);


  useEffect(() => {
    setTimeout(() => {
      mapRef.current?.resize();
    }, 300);
  }, [painelAberto]);

  const [posicaoPixel, setPosicaoPixel] = useState({ x: 0, y: 0 });
  const [posicaoPixelVazao, setPosicaoPixelVazao] = useState({
  x: 0,
  y: 0,
});

  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));


  // Bloco para adaptar gráficos as estações selecionadas
  const atualizarPosicaoGrafico = () => {
    if (!mapRef.current || !estacaoSelecionada) return;
    const map = mapRef.current.getMap();     
    const pixel = map.project([estacaoSelecionada.longitude, estacaoSelecionada.latitude]);   
    setPosicaoPixel({
      x: pixel.x,
      y: pixel.y
    });
  };

  const atualizarPosicaoGraficoVazao = () => {
  if (!mapRef.current || !rioSelecionado) return;

  const map = mapRef.current.getMap();

  const pixel = map.project([
    rioSelecionado.longitude,
    rioSelecionado.latitude,
  ]);

  setPosicaoPixelVazao({
    x: pixel.x,
    y: pixel.y,
  });
};

  useEffect(() => {
    if (!estacaoSelecionada) return;
    atualizarPosicaoGrafico(); 
    const map = mapRef.current?.getMap();
    if (map) {
      map.on("move", atualizarPosicaoGrafico); 
    }

    return () => {
      map?.off("move", atualizarPosicaoGrafico);
    };
  }, [estacaoSelecionada]);

  useEffect(() => {
  if (!rioSelecionado) return;

  atualizarPosicaoGraficoVazao();

  const map = mapRef.current?.getMap();

  if (map) {
    map.on("move", atualizarPosicaoGraficoVazao);
  }

  return () => {
    map?.off("move", atualizarPosicaoGraficoVazao);
  };
}, [rioSelecionado]);
  
  // Na previsão, a camada de vazão mostra os pontos de vazão no lugar das estações
  const cenario = ehCenario(fonteDados);
  const mostrarVazao = camadaBase === "vazao" && !cenario;
  const mostrarEstacoes = !cenario && !mostrarVazao;

  useEffect(() => {
    if (!mostrarVazao) setRioSelecionado(null);
  }, [mostrarVazao]);

  const selecionarEstacao = (station, moverMapa = false) => {
    setEstacaoSelecionada({
      id: station.id,
      nome: station.nome,
      latitude: station.latitude,
      longitude: station.longitude
    });

    // Move o mapa somente quando solicitado, deixando espaço para o gráfico
    if (moverMapa && mapRef.current) {
      mapRef.current.flyTo({
        center: [station.longitude, station.latitude],
        zoom: Math.max(mapRef.current.getZoom(), 8),
        duration: 1000,
        essential: true,
        offset: isMobile ? [0, -80] : [-250, 220]
      });
    }
  };

  // Timeline compartilhada: aparece quando há alguma camada temporal ativa
  const campoBase = ehCampoTemporal(camadaBase) ? camadaBase : null;
  const temCamadaTemporal = Boolean(campoBase) || vetores.corrente || vetores.vento;
  const { maxTimeStep, tickInterval } = horizonteTimeline(fonteDados);

  // Início da timeline: timestep 000 da camada base (ou dos vetores)
  const prefixoBase = campoBase ?? (vetores.corrente ? "corrente" : vetores.vento ? "vento" : null);
  const dataBaseTimeline = useDataBase(
    fonteDados,
    prefixoBase,
    campoBase === "nivel" ? null : campoBase ? "velocidade" : "direcao"
  );

  // Data do arquivo carregado; sem arquivo, calculada pela data base + timeStep
  const [dataDoArquivo, setDataDoArquivo] = useState(null);
  const dataFormatada =
    dataDoArquivo ||
    (dataBaseTimeline
      ? formatarData(new Date(dataBaseTimeline.getTime() + timeStep * 60 * 60 * 1000))
      : "");

  return (
    <div style={{ position: "absolute", inset: 0 }}>
      <Map
        ref={mapRef}
        reuseMaps
        trackResize
        mapboxAccessToken={import.meta.env.VITE_MAPBOX_TOKEN}
        initialViewState={{
          longitude: -51.5,
          latitude: -31.25,
          zoom: 6
        }}
        mapStyle="mapbox://styles/mapbox/light-v11"
        style={{ position: "absolute", inset: 0 }}
      >
        {!isMobile ? <NavigationControl position="top-left" /> : null}

        <LayerCampos
          fonteDados={fonteDados}
          timeStep={timeStep}
          camadaBase={camadaBase}
          vetores={vetores}
          mostrarMalha={mostrarMalha}
          onDataHora={setDataDoArquivo}
        />

        {mostrarEstacoes && (
          <MarcadoresEstacoes
            estacaoSelecionada={estacaoSelecionada}
            onSelecionar={selecionarEstacao}
          />
        )}

        {mostrarVazao && (
          <LayerVazao
            rioSelecionado={rioSelecionado}
            setRioSelecionado={setRioSelecionado}
          />
        )}
      </Map>

      {/* Coluna direita: legenda + lista de estações */}
      <div
        style={{
          position: "absolute",
          right: isMobile ? "10px" : "20px",
          top: isMobile ? "10px" : "20px",
          bottom: isMobile ? "110px" : "120px",
          zIndex: 1000,
          width: isMobile ? "150px" : "210px",
          display: "flex",
          flexDirection: "column",
          gap: isMobile ? "8px" : "10px",
          overflowY: "auto",
          scrollbarWidth: "none",
          pointerEvents: "none",
          fontFamily: "system-ui, -apple-system, sans-serif",
          color: "#2A3D59"
        }}
      >
        <div style={{ pointerEvents: "auto", display: "flex", flexDirection: "column", gap: isMobile ? "8px" : "10px" }}>
          <LegendaMapa camadaBase={camadaBase} />
          {mostrarEstacoes && (
            <PainelEstacoes
              estacaoSelecionada={estacaoSelecionada}
              onSelecionar={selecionarEstacao}
            />
          )}
        </div>
      </div>

      {temCamadaTemporal && (
        <Timeline
          timeStep={timeStep}
          setTimeStep={setTimeStep}
          maxTimeStep={maxTimeStep}
          tickInterval={tickInterval}
          dataFormatada={dataFormatada}
          dataBaseTimeline={dataBaseTimeline}
        />
      )}

      {/* Pop-up do Gráfico de Vazão */}
      {mostrarVazao && rioSelecionado && (
        isMobile ? (
          createPortal(
            <div
              style={{
                position: "fixed",
                zIndex: 2000,
                left: "50%",
                bottom: "16px",
                transform: "translateX(-50%)",
                width: "95vw",
                maxWidth: "95vw",
                height: "260px",
                background: "rgba(255, 255, 255, 0.88)",
                backdropFilter: "blur(10px)",
                border: "1px solid rgba(255, 255, 255, 0.4)",
                borderRadius: "16px",
                padding: "10px 12px",
                boxShadow: "0 10px 30px rgba(42, 61, 89, 0.2)",
                display: "flex",
                flexDirection: "column",
                fontFamily: "system-ui, -apple-system, sans-serif",
                pointerEvents: "auto",
                boxSizing: "border-box",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  top: 10,
                  right: 10,
                  display: "flex",
                  gap: "6px",
                  zIndex: 1000,
                }}
              >
                <button
                  onClick={() =>
                    chartVazaoRef.current?.baixarGrafico()
                  }
                  title="Baixar gráfico (PNG)"
                  style={{
                    background: "rgba(42, 61, 89, 0.1)",
                    border: "none",
                    borderRadius: "50%",
                    width: "22px",
                    height: "22px",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#2A3D59",
                  }}
                >
                  <Download size={11} />
                </button>

                <button
                  onClick={() => setRioSelecionado(null)}
                  title="Fechar"
                  style={{
                    background: "rgba(42, 61, 89, 0.1)",
                    border: "none",
                    borderRadius: "50%",
                    width: "22px",
                    height: "22px",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#2A3D59",
                  }}
                >
                  <X size={11} />
                </button>
              </div>

              <div
                style={{
                  flexGrow: 1,
                  width: "100%",
                  height: "100%",
                  minHeight: 0,
                }}
              >
                <LineChartVazao
                  ref={chartVazaoRef}
                  rioSelecionado={rioSelecionado}
                  titulo="Previsão de Vazão"
                />
              </div>
            </div>,
            document.body
          )
        ) : (
          <div
            style={{
              position: "absolute",
              zIndex: 1010,

              left: `${posicaoPixelVazao.x - 5}px`,
              top: `${posicaoPixelVazao.y - 340}px`,

              width: "800px",
              height: "320px",

              background: "rgba(255, 255, 255, 0.88)",
              backdropFilter: "blur(10px)",

              border: "1px solid rgba(255, 255, 255, 0.4)",
              borderRadius: "16px",

              padding: "16px",

              boxShadow:
                "0 10px 30px rgba(42, 61, 89, 0.2)",

              display: "flex",
              flexDirection: "column",

              fontFamily:
                "system-ui, -apple-system, sans-serif",

              pointerEvents: "auto",
              boxSizing: "border-box",
            }}
          >
            <div
              style={{
                position: "absolute",
                top: 18,
                right: 18,
                display: "flex",
                gap: "8px",
                zIndex: 1000,
              }}
            >
              <button
                onClick={() =>
                  chartVazaoRef.current?.baixarGrafico()
                }
                title="Baixar gráfico (PNG)"
                style={{
                  background: "rgba(42, 61, 89, 0.1)",
                  border: "none",
                  borderRadius: "50%",
                  width: "24px",
                  height: "24px",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#00695C",
                }}
              >
                <Download size={13} />
              </button>

              <button
                onClick={() => setRioSelecionado(null)}
                title="Fechar"
                style={{
                  background: "rgba(42, 61, 89, 0.1)",
                  border: "none",
                  borderRadius: "50%",
                  width: "24px",
                  height: "24px",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#00695C",
                }}
              >
                <X size={13} />
              </button>
            </div>

            <div
              style={{
                flexGrow: 1,
                width: "100%",
                height: "100%",
                minHeight: 0,
              }}
            >
              <LineChartVazao
                ref={chartVazaoRef}
                rioSelecionado={rioSelecionado}
                titulo="Previsão de Vazão"
              />
            </div>
          </div>
        )
      )}

      {/* Pop-up do Gráfico de Nível */}
    {mostrarEstacoes && estacaoSelecionada && (
      isMobile ? (
        createPortal(
          <div
            style={{
              position: "fixed",       
              zIndex: 2000,             
              left: "50%",
              bottom: "16px",
              transform: "translateX(-50%)",
              width: "95vw",
              maxWidth: "95vw",
              height: "320px",
              background: "rgba(255, 255, 255, 0.88)",
              backdropFilter: "blur(10px)",
              border: "1px solid rgba(255, 255, 255, 0.4)",
              borderRadius: "16px",
              padding: "10px 12px",
              boxShadow: "0 10px 30px rgba(42, 61, 89, 0.2)",
              display: "flex",
              flexDirection: "column",
              fontFamily: "system-ui, -apple-system, sans-serif",
              pointerEvents: "auto",
              boxSizing: "border-box"
            }}
          >
            <PainelGraficoNivel
              ref={chartApiRef}
              estacaoSelecionada={estacaoSelecionada}
              titulo="Previsão de Nível"
              alturaGrafico={205}
              isMobile={true}
              acoes={
                <div style={{ display: "flex", gap: "6px" }}>
                <button
                  onClick={() => chartApiRef.current?.baixarGrafico()}
                  title="Baixar gráfico (PNG)"
                  style={{
                    background: "rgba(42, 61, 89, 0.1)",
                    border: "none",
                    borderRadius: "50%",
                    width: "22px",
                    height: "22px",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#2A3D59",
                    transition: "background 0.2s"
                  }}
                >
                  <Download size={11} />
                </button>

                <button
                  onClick={() => setEstacaoSelecionada(null)}
                  title="Fechar"
                  style={{
                    background: "rgba(42, 61, 89, 0.1)",
                    border: "none",
                    borderRadius: "50%",
                    width: "22px",
                    height: "22px",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#2A3D59",
                    fontWeight: "bold",
                    fontSize: "12px",
                    transition: "background 0.2s"
                  }}
                >
                  <X size={11} />
                </button>
              </div>
              }
            />
          </div>,
          document.body
        )
      ) : (
        <div
          style={{
            position: "absolute",
            zIndex: 1010,
            left: `${posicaoPixel.x - 5}px`,
            top: `${posicaoPixel.y - 400}px`,
            width: "800px",
            height: "380px",
            background: "rgba(255, 255, 255, 0.88)",
            backdropFilter: "blur(10px)",
            border: "1px solid rgba(255, 255, 255, 0.4)",
            borderRadius: "16px",
            padding: "16px",
            boxShadow: "0 10px 30px rgba(42, 61, 89, 0.2)",
            display: "flex",
            flexDirection: "column",
            fontFamily: "system-ui, -apple-system, sans-serif",
            pointerEvents: "auto",
            boxSizing: "border-box"
          }}
        >
          <PainelGraficoNivel
            ref={chartApiRef}
            estacaoSelecionada={estacaoSelecionada}
            titulo="Previsão de Nível"
            alturaGrafico={250}
              isMobile={false}
              acoes={
                <div style={{ display: "flex", gap: "8px" }}>
              <button
                onClick={() => chartApiRef.current?.baixarGrafico()}
                title="Baixar gráfico (PNG)"
                style={{
                  background: "rgba(42, 61, 89, 0.1)",
                  border: "none",
                  borderRadius: "50%",
                  width: "24px",
                  height: "24px",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#2A3D59",
                  transition: "background 0.2s"
                }}
              >
                <Download size={13} />
              </button>

              <button
                onClick={() => setEstacaoSelecionada(null)}
                title="Fechar"
                style={{
                  background: "rgba(42, 61, 89, 0.1)",
                  border: "none",
                  borderRadius: "50%",
                  width: "24px",
                  height: "24px",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#2A3D59",
                  fontWeight: "bold",
                  fontSize: "12px",
                  transition: "background 0.2s"
                }}
              >
                <X size={13} />
              </button>
            </div>
              }
          />
        </div>
      )
    )}
        </div>
  );
}