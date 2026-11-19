
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { SegmentoFraseLSC } from "../data/lscPhrasePlanner";

import { cargarRegistrosLSC } from "../data/lscLinguisticRecords";

import {
  movimientosLSC,
  movimientoAptoParaPruebas,
} from "../data/lscMotionResources";

import {
  validarSecuenciaMovimiento,
  obtenerFotogramaInterpolado,
} from "../data/lscMotionPlayer";

import LSCMotionPreflightReport from "./LSCMotionPreflightReport";

type RegistroJerarquiaHueso = {
  nombre: string;
  padre: string;
  x: number;
  y: number;
  z: number;
  mundoX: number;
  mundoY: number;
  mundoZ: number;
};

type DiagnosticoHuesoMano = {
  nombre: string;
  padre: string;
  posicionLocal: string;
  posicionMundial: string;
  rotacionLocal: string;
  rotacionMundial: string;
};

type LecturaActualArticulacion = {
  nombre: string;
  posicionLocal: string;
  posicionMundial: string;
  rotacionLocal: string;
  rotacionMundial: string;
  fecha: string;
};

type AsociacionMediaPipeEMA = {
  id: string;
  lado: "Left" | "Right";
  punto: number;
  nombrePunto: string;
  hueso: string;
  estado: "pendiente-revision-anatomica";
};

type PuntoReferenciaMano = {
  x: number;
  y: number;
  z: number;
};

type MuestraPosturaMano = {
  id: string;
  nombre: string;
  lado: "Left" | "Right";
  fechaCaptura: string;
  coordenadasNormalizadas: PuntoReferenciaMano[];
  coordenadasMundo: PuntoReferenciaMano[] | null;
  estado: "experimental";
};

type LSCAvatarProps = {
  manosDetectadas?: {
    x: number;
    y: number;
    z: number;
  }[][];
  ladosManosDetectadas?: string[];
  manosMundoDetectadas?: {
    x: number;
    y: number;
    z: number;
  }[][];
  segmentos?: SegmentoFraseLSC[];
  indiceSeleccionado?: number;
  onIndiceSeleccionadoChange?: (indice: number) => void;
  seleccionDeshabilitada?: boolean;
};

function obtenerEstadoLinguisticoAvatar(senaId: string): {
  titulo: string;
  detalle: string;
} {
  const registro = cargarRegistrosLSC()[senaId];

  if (!registro || registro.estado === "pendiente") {
    return {
      titulo: "Pendiente de revisión lingüística",
      detalle:
        "No hay una revisión lingüística registrada para este concepto. No debe presentarse como una traducción confirmada.",
    };
  }

  if (registro.estado === "en-revision") {
    return {
      titulo: "En revisión lingüística",
      detalle:
        "La revisión está en curso. Todavía no debe presentarse como una traducción confirmada.",
    };
  }

  if (
    !registro.responsable?.trim() ||
    !registro.evidencia?.trim() ||
    !registro.fecha?.trim()
  ) {
    return {
      titulo: "Registro de revisión incompleto",
      detalle:
        "El registro está marcado como validado, pero faltan datos obligatorios. Completa el responsable, la evidencia y la fecha.",
    };
  }

  return {
    titulo: "Revisión documentada",
    detalle:
      "El registro contiene responsable, evidencia y fecha. Esto documenta la revisión, pero no garantiza por sí solo que la seña sea adecuada en todos los contextos.",
  };
}

const PUNTOS_MEDIAPIPE = [
  "Muñeca",
  "Pulgar: base",
  "Pulgar: articulación 1",
  "Pulgar: articulación 2",
  "Pulgar: punta",
  "Índice: base",
  "Índice: articulación 1",
  "Índice: articulación 2",
  "Índice: punta",
  "Medio: base",
  "Medio: articulación 1",
  "Medio: articulación 2",
  "Medio: punta",
  "Anular: base",
  "Anular: articulación 1",
  "Anular: articulación 2",
  "Anular: punta",
  "Meñique: base",
  "Meñique: articulación 1",
  "Meñique: articulación 2",
  "Meñique: punta",
];

const MODELO_URL =
  "https://raw.githubusercontent.com/talianat589-code/lsc-conecta-modelos/8499dff65c6479dbabbe91ce7bc0c4a9570819ee/EMA.glb";

  const CLAVE_ASOCIACIONES_EMA =
  "lsc-conecta-asociaciones-mediapipe-ema-v1";

  const CLAVE_MUESTRAS_POSTURA =
  "lsc-conecta-muestras-posturas-v1";

  export default function LSCAvatar({
    manosDetectadas = [],
    ladosManosDetectadas = [],
    manosMundoDetectadas = [],
    segmentos = [],

    indiceSeleccionado,
    onIndiceSeleccionadoChange,
    seleccionDeshabilitada = false,
  }: LSCAvatarProps) {

  const contenedorRef = useRef<HTMLDivElement>(null);
  const [estado, setEstado] = useState("Preparando el avatar 3D...");
  const [nombresHuesos, setNombresHuesos] = useState<string[]>([]);

  const [diagnosticoHuesosMano, setDiagnosticoHuesosMano] =
  useState<DiagnosticoHuesoMano[]>([]);

  const [lecturaActualArticulacion, setLecturaActualArticulacion] =
  useState<LecturaActualArticulacion | null>(null);

  const [jerarquiaHuesos, setJerarquiaHuesos] =
  useState<RegistroJerarquiaHueso[]>([]);

  const [diagnosticoModelo, setDiagnosticoModelo] = useState<{
    ancho: number;
    altura: number;
    profundidad: number;
    centroX: number;
    centroY: number;
    centroZ: number;
    escalaX: number;
    escalaY: number;
    escalaZ: number;
  } | null>(null);

  const [diagnosticoOrientacion, setDiagnosticoOrientacion] =
  useState<{
    rotacionX: number;
    rotacionY: number;
    rotacionZ: number;
    escalaX: number;
    escalaY: number;
    escalaZ: number;
  } | null>(null);

  const huesosRef = useRef<Record<string, THREE.Bone>>({});
const rotacionesOriginalesRef = useRef<
  Record<string, THREE.Euler>
>({});

const [huesoSeleccionado, setHuesoSeleccionado] = useState("");
const [eje, setEje] = useState<"x" | "y" | "z">("z");
const [giroGrados, setGiroGrados] = useState(0);

const [ladoAsociacion, setLadoAsociacion] =
  useState<"Left" | "Right">("Left");

const [puntoAsociacion, setPuntoAsociacion] =
  useState(0);

const [huesoAsociacion, setHuesoAsociacion] =
  useState("");

  const [asociacionesMediaPipe, setAsociacionesMediaPipe] =
  useState<AsociacionMediaPipeEMA[]>(() => {
    try {
      const guardado = localStorage.getItem(
        CLAVE_ASOCIACIONES_EMA
      );

      if (!guardado) return [];

      const datos = JSON.parse(guardado);

      if (
        datos.version !== 1 ||
        datos.modeloUrl !== MODELO_URL ||
        !Array.isArray(datos.asociaciones)
      ) {
        return [];
      }

      return datos.asociaciones.filter(
        (item: AsociacionMediaPipeEMA) =>
          item &&
          typeof item.id === "string" &&
          (item.lado === "Left" || item.lado === "Right") &&
          Number.isInteger(item.punto) &&
          item.punto >= 0 &&
          item.punto < PUNTOS_MEDIAPIPE.length &&
          item.nombrePunto === PUNTOS_MEDIAPIPE[item.punto] &&
          typeof item.hueso === "string" &&
          item.hueso.trim().length > 0 &&
          item.estado === "pendiente-revision-anatomica"
      );
    } catch {
      return [];
    }
  });

const [estadoAsociaciones, setEstadoAsociaciones] =
  useState("Todavía no hay asociaciones registradas.");

  const [nombrePostura, setNombrePostura] =
  useState("");

const [ladoPostura, setLadoPostura] =
  useState<"Left" | "Right">("Left");

const [estadoPosturas, setEstadoPosturas] =
  useState("Esperando una captura de postura.");

const [muestrasPosturas, setMuestrasPosturas] =
  useState<MuestraPosturaMano[]>(() => {
    try {
      const guardado = localStorage.getItem(
        CLAVE_MUESTRAS_POSTURA
      );

      if (!guardado) return [];

      const datos = JSON.parse(guardado);

      if (!Array.isArray(datos)) return [];

      return datos.filter(
        (item: MuestraPosturaMano) =>
          item &&
          typeof item.id === "string" &&
          typeof item.nombre === "string" &&
          (item.lado === "Left" || item.lado === "Right") &&
          Array.isArray(item.coordenadasNormalizadas) &&
          item.coordenadasNormalizadas.length === 21 &&
          item.coordenadasNormalizadas.every(
            (punto) =>
              Number.isFinite(punto.x) &&
              Number.isFinite(punto.y) &&
              Number.isFinite(punto.z)
          )
      );
    } catch {
      return [];
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(
        CLAVE_MUESTRAS_POSTURA,
        JSON.stringify(muestrasPosturas)
      );
  
      setEstadoPosturas(
        "Muestras guardadas en este dispositivo."
      );
    } catch {
      setEstadoPosturas(
        "No se pudieron guardar las muestras. Exporta un respaldo JSON."
      );
    }
  }, [muestrasPosturas]);

  useEffect(() => {
    try {
      const contenido = {
        proyecto: "LSC Conecta",
        tipo: "Correspondencias manuales MediaPipe a EMA",
        version: 1,
        modeloUrl: MODELO_URL,
        fechaActualizacion: new Date().toISOString(),
        totalAsociaciones: asociacionesMediaPipe.length,
        asociaciones: asociacionesMediaPipe,
      };
  
      localStorage.setItem(
        CLAVE_ASOCIACIONES_EMA,
        JSON.stringify(contenido)
      );
    } catch {
      setEstadoAsociaciones(
        "No se pudieron guardar las asociaciones en este dispositivo. Exporta el respaldo JSON."
      );
    }
  }, [asociacionesMediaPipe]);

const [segmentoSeleccionado, setSegmentoSeleccionado] =
  useState(0);

  const [movimientoSeleccionado, setMovimientoSeleccionado] =
  useState("");

const [reproduciendo, setReproduciendo] = useState(false);

const [estadoReproductor, setEstadoReproductor] = useState(
  "Reproductor preparado. Esperando movimientos autorizados."
);

const fotogramaMovimientoRef = useRef<number | null>(null);
const reproduccionActivaRef = useRef(false);

const huesosManoCandidatos = nombresHuesos.filter(
  (nombre) =>
    /(hand|finger|thumb|index|middle|ring|pinky|little|wrist)/i.test(nombre)
);

const huesosManoIzquierda = huesosManoCandidatos.filter(
  (nombre) => /(left|izquierd)/i.test(nombre)
);

const huesosManoDerecha = huesosManoCandidatos.filter(
  (nombre) => /(right|derech)/i.test(nombre)
);

const huesosManoSinLado = huesosManoCandidatos.filter(
  (nombre) => !/(left|right|izquierd|derech)/i.test(nombre)
);

const jerarquiaManos = jerarquiaHuesos.filter(
  (hueso) =>
    /(hand|finger|thumb|index|middle|ring|pinky|little|wrist)/i.test(
      hueso.nombre
    )
);

const jerarquiaManoIzquierda = jerarquiaManos.filter(
  (hueso) => /(left|izquierd)/i.test(hueso.nombre)
);

const jerarquiaManoDerecha = jerarquiaManos.filter(
  (hueso) => /(right|derech)/i.test(hueso.nombre)
);

const jerarquiaManosSinLado = jerarquiaManos.filter(
  (hueso) =>
    !/(left|right|izquierd|derech)/i.test(hueso.nombre)
);

const jerarquiaHuesoSeleccionado = jerarquiaHuesos.find(
  (hueso) => hueso.nombre === huesoSeleccionado
);

const hijosHuesoSeleccionado = jerarquiaHuesos.filter(
  (hueso) => hueso.padre === huesoSeleccionado
);

const indiceManoAsociacion = ladosManosDetectadas.findIndex(
  (lado) => lado === ladoAsociacion
);

const manoAsociacionEnVivo =
  indiceManoAsociacion >= 0
    ? manosDetectadas[indiceManoAsociacion]
    : undefined;

const puntoAsociacionEnVivo =
  manoAsociacionEnVivo?.[puntoAsociacion];

  const manoMundoAsociacionEnVivo =
  indiceManoAsociacion >= 0
    ? manosMundoDetectadas[indiceManoAsociacion]
    : undefined;

const puntoMundoAsociacionEnVivo =
  manoMundoAsociacionEnVivo?.[puntoAsociacion];

  const indiceManoReferencia = ladosManosDetectadas.findIndex(
    (lado) => lado === ladoPostura
  );
  
  const manoReferenciaEnVivo =
    indiceManoReferencia >= 0
      ? manosDetectadas[indiceManoReferencia]
      : undefined;
  
  const manoMundoReferenciaEnVivo =
    indiceManoReferencia >= 0
      ? manosMundoDetectadas[indiceManoReferencia]
      : undefined;
  
  const capturarPosturaReferencia = () => {
    const nombre = nombrePostura.trim();
  
    if (!nombre) {
      setEstadoPosturas(
        "Escribe un nombre para identificar la postura."
      );
      return;
    }
  
    if (
      !manoReferenciaEnVivo ||
      manoReferenciaEnVivo.length !== 21
    ) {
      setEstadoPosturas(
        "No se detectaron los 21 puntos de la mano seleccionada."
      );
      return;
    }
  
    const puntosValidos = manoReferenciaEnVivo.every(
      (punto) =>
        Number.isFinite(punto.x) &&
        Number.isFinite(punto.y) &&
        Number.isFinite(punto.z)
    );
  
    if (!puntosValidos) {
      setEstadoPosturas(
        "La lectura contiene coordenadas incompletas."
      );
      return;
    }
  
    const coordenadasMundo =
      manoMundoReferenciaEnVivo?.length === 21 &&
      manoMundoReferenciaEnVivo.every(
        (punto) =>
          Number.isFinite(punto.x) &&
          Number.isFinite(punto.y) &&
          Number.isFinite(punto.z)
      )
        ? manoMundoReferenciaEnVivo.map((punto) => ({
            x: Number(punto.x.toFixed(5)),
            y: Number(punto.y.toFixed(5)),
            z: Number(punto.z.toFixed(5)),
          }))
        : null;
  
    const nuevaMuestra: MuestraPosturaMano = {
      id: `${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 8)}`,
  
      nombre,
      lado: ladoPostura,
      fechaCaptura: new Date().toISOString(),
  
      coordenadasNormalizadas:
        manoReferenciaEnVivo.map((punto) => ({
          x: Number(punto.x.toFixed(5)),
          y: Number(punto.y.toFixed(5)),
          z: Number(punto.z.toFixed(5)),
        })),
  
      coordenadasMundo,
  
      estado: "experimental",
    };
  
    setMuestrasPosturas((actuales) => [
      nuevaMuestra,
      ...actuales,
    ]);
  
    setEstadoPosturas(
      coordenadasMundo
        ? "Postura capturada con 21 puntos y coordenadas 3D."
        : "Postura capturada con 21 puntos. Las coordenadas 3D no estaban disponibles."
    );
  
    setNombrePostura("");
  };

const asociacionActual = asociacionesMediaPipe.find(
  (item) =>
    item.lado === ladoAsociacion &&
    item.punto === puntoAsociacion
);

const guardarAsociacion = () => {
  if (!huesosRef.current[huesoAsociacion]) {
    setEstadoAsociaciones(
      "Selecciona un hueso válido del modelo EMA."
    );
    return;
  }

  const nuevaAsociacion: AsociacionMediaPipeEMA = {
    id: `${ladoAsociacion}-${puntoAsociacion}`,
    lado: ladoAsociacion,
    punto: puntoAsociacion,
    nombrePunto: PUNTOS_MEDIAPIPE[puntoAsociacion],
    hueso: huesoAsociacion,
    estado: "pendiente-revision-anatomica",
  };

  setAsociacionesMediaPipe((actuales) => [
    ...actuales.filter(
      (item) =>
        item.lado !== ladoAsociacion ||
        item.punto !== puntoAsociacion
    ),
    nuevaAsociacion,
  ]);

  setEstadoAsociaciones(
    "Asociación provisional registrada. Pendiente de revisión anatómica."
  );
};

const eliminarAsociacion = (id: string) => {
  setAsociacionesMediaPipe((actuales) =>
    actuales.filter((item) => item.id !== id)
  );

  setEstadoAsociaciones(
    "Asociación eliminada del registro."
  );
};

const exportarAsociaciones = () => {
  const contenido = {
    proyecto: "LSC Conecta",
    tipo: "Correspondencias manuales MediaPipe a EMA",
    version: 1,
    estadoGeneral: "pendiente-revision-anatomica",
    fechaExportacion: new Date().toISOString(),
    totalAsociaciones: asociacionesMediaPipe.length,
    asociaciones: asociacionesMediaPipe,
  };

  const archivo = new Blob(
    [JSON.stringify(contenido, null, 2)],
    { type: "application/json" }
  );

  const url = URL.createObjectURL(archivo);
  const enlace = document.createElement("a");

  enlace.href = url;
  enlace.download = "lsc-asociaciones-mediapipe-ema.json";
  document.body.appendChild(enlace);
  enlace.click();
  enlace.remove();

  URL.revokeObjectURL(url);
};

const exportarMuestrasPosturas = () => {
  const contenido = {
    proyecto: "LSC Conecta",
    versionFormato: "1.0.0",
    fechaExportacion: new Date().toISOString(),

    tipoDatos: "muestras_experimentales_de_posturas",

    estadoValidacion: "no_validado_linguisticamente",

    descripcion: {
      puntos: "21 puntos de referencia de MediaPipe por mano.",
      coordenadasNormalizadas:
        "Coordenadas normalizadas de la detección.",
      coordenadasMundo:
        "Coordenadas tridimensionales de MediaPipe cuando están disponibles.",
    },

    totalMuestras: muestrasPosturas.length,

    muestras: muestrasPosturas,
  };

  const archivo = new Blob(
    [JSON.stringify(contenido, null, 2)],
    { type: "application/json" }
  );

  const url = URL.createObjectURL(archivo);
  const enlace = document.createElement("a");

  enlace.href = url;
  enlace.download = "lsc-conecta-muestras-posturas.json";

  document.body.appendChild(enlace);
  enlace.click();
  enlace.remove();

  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

const eliminarMuestraPostura = (id: string) => {
  setMuestrasPosturas((actuales) =>
    actuales.filter((muestra) => muestra.id !== id)
  );

  setEstadoPosturas(
    "Muestra eliminada del registro."
  );
};

useEffect(() => {
  setSegmentoSeleccionado((actual) => {
    if (segmentos.length === 0) {
      return 0;
    }

    const objetivo =
      indiceSeleccionado ?? actual;

    return Math.max(
      0,
      Math.min(objetivo, segmentos.length - 1)
    );
  });
}, [indiceSeleccionado, segmentos.length]);

  useEffect(() => {
    const contenedor = contenedorRef.current;
    if (!contenedor) return;

    let activo = true;
    let modelo: THREE.Object3D | null = null;
let mezclador: THREE.AnimationMixer | null = null;
let ejesReferencia: THREE.AxesHelper | null = null;
let fotograma = 0;

    const escena = new THREE.Scene();
    escena.background = new THREE.Color("#f0f7ff");

    const camara = new THREE.PerspectiveCamera(
      35,
      1,
      0.1,
      1000
    );
    camara.position.set(0, 1.5, 5);

    const renderizador = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
    });

    renderizador.setPixelRatio(
      Math.min(window.devicePixelRatio, 2)
    );
    renderizador.outputColorSpace = THREE.SRGBColorSpace;
    renderizador.setSize(
      contenedor.clientWidth || 320,
      360
    );

    contenedor.appendChild(renderizador.domElement);

    escena.add(new THREE.HemisphereLight(0xffffff, 0x8da4bd, 2));

    const luz = new THREE.DirectionalLight(0xffffff, 2.5);
    luz.position.set(3, 5, 4);
    escena.add(luz);

    const reloj = new THREE.Clock();

    const ajustarTamaño = () => {
      if (!activo) return;

      const ancho = contenedor.clientWidth || 320;
      const alto = 360;

      camara.aspect = ancho / alto;
      camara.updateProjectionMatrix();
      renderizador.setSize(ancho, alto);
    };

    const observador = new ResizeObserver(ajustarTamaño);
    observador.observe(contenedor);
    ajustarTamaño();

    new GLTFLoader().load(
      MODELO_URL,
      (gltf) => {
        if (!activo) return;
    
        modelo = gltf.scene;
    
        let cantidadHuesos = 0;
const nombresHuesos: string[] = [];

const huesos: Record<string, THREE.Bone> = {};
const rotacionesOriginales: Record<string, THREE.Euler> = {};

modelo.traverse((objeto) => {
  if ((objeto as THREE.Bone).isBone) {
    const hueso = objeto as THREE.Bone;
    const nombre = hueso.name || `hueso-${cantidadHuesos}`;

    cantidadHuesos++;
    nombresHuesos.push(nombre);
    huesos[nombre] = hueso;
    rotacionesOriginales[nombre] = hueso.rotation.clone();
  }
});

huesosRef.current = huesos;
rotacionesOriginalesRef.current = rotacionesOriginales;

setNombresHuesos(nombresHuesos);
const nuevaJerarquia: RegistroJerarquiaHueso[] =
  Object.entries(huesos).map(([nombreRegistrado, hueso]) => {
    let padre = hueso.parent;

    while (
      padre &&
      !(padre as THREE.Bone).isBone
    ) {
      padre = padre.parent;
    }

    return {
      nombre: nombreRegistrado,
      padre: padre?.name || "Raíz",
      x: Number(hueso.position.x.toFixed(4)),
y: Number(hueso.position.y.toFixed(4)),
z: Number(hueso.position.z.toFixed(4)),
mundoX: 0,
mundoY: 0,
mundoZ: 0,
    
    };
  });

setJerarquiaHuesos(nuevaJerarquia);
const primerHuesoMano = nombresHuesos.find(
  (nombre) =>
    /(hand|finger|thumb|index|middle|ring|pinky|little|wrist)/i.test(
      nombre
    )
);

setHuesoSeleccionado(
  primerHuesoMano ?? nombresHuesos[0] ?? ""
);
setGiroGrados(0);
    
        console.log("EMA: huesos encontrados:", cantidadHuesos);
        console.log("EMA: nombres de huesos:", nombresHuesos);
        
        console.log(
          "EMA: animaciones disponibles:",
          gltf.animations.map((animacion) => animacion.name)
        );
    
        escena.add(modelo);

        const caja = new THREE.Box3().setFromObject(modelo);
const centro = caja.getCenter(new THREE.Vector3());
const tamaño = caja.getSize(new THREE.Vector3());

setDiagnosticoModelo({
  ancho: Number(tamaño.x.toFixed(4)),
  altura: Number(tamaño.y.toFixed(4)),
  profundidad: Number(tamaño.z.toFixed(4)),
  centroX: Number(centro.x.toFixed(4)),
  centroY: Number(centro.y.toFixed(4)),
  centroZ: Number(centro.z.toFixed(4)),
  escalaX: Number(modelo.scale.x.toFixed(4)),
  escalaY: Number(modelo.scale.y.toFixed(4)),
  escalaZ: Number(modelo.scale.z.toFixed(4)),
});

modelo.position.sub(centro);

        modelo.updateMatrixWorld(true);

        const rotacionMundial = new THREE.Euler().setFromQuaternion(
          modelo.getWorldQuaternion(new THREE.Quaternion()),
          "XYZ"
        );
        
        const escalaMundial = modelo.getWorldScale(
          new THREE.Vector3()
        );
        
        setDiagnosticoOrientacion({
          rotacionX: Number(
            THREE.MathUtils.radToDeg(rotacionMundial.x).toFixed(2)
          ),
          rotacionY: Number(
            THREE.MathUtils.radToDeg(rotacionMundial.y).toFixed(2)
          ),
          rotacionZ: Number(
            THREE.MathUtils.radToDeg(rotacionMundial.z).toFixed(2)
          ),
          escalaX: Number(escalaMundial.x.toFixed(4)),
          escalaY: Number(escalaMundial.y.toFixed(4)),
          escalaZ: Number(escalaMundial.z.toFixed(4)),
        });

        const nuevosDiagnosticos: DiagnosticoHuesoMano[] = [];

Object.entries(huesos).forEach(([nombre, hueso]) => {
  if (
    !/(hand|finger|thumb|index|middle|ring|pinky|little|wrist)/i.test(
      nombre
    )
  ) {
    return;
  }

  let padre = hueso.parent;

  while (padre && !(padre as THREE.Bone).isBone) {
    padre = padre.parent;
  }

  const posicionLocal = hueso.position.clone();
  const posicionMundial = hueso.getWorldPosition(
    new THREE.Vector3()
  );

  const rotacionLocal = hueso.rotation.clone();

  const quaternionMundial = hueso.getWorldQuaternion(
    new THREE.Quaternion()
  );

  const rotacionMundial = new THREE.Euler().setFromQuaternion(
    quaternionMundial,
    "XYZ"
  );

  const grados = (valor: number) =>
    Number(THREE.MathUtils.radToDeg(valor).toFixed(2));

  nuevosDiagnosticos.push({
    nombre,
    padre: padre?.name || "Raíz",

    posicionLocal: [
      posicionLocal.x,
      posicionLocal.y,
      posicionLocal.z,
    ].map((valor) => Number(valor.toFixed(4))).join(" / "),

    posicionMundial: [
      posicionMundial.x,
      posicionMundial.y,
      posicionMundial.z,
    ].map((valor) => Number(valor.toFixed(4))).join(" / "),

    rotacionLocal: [
      grados(rotacionLocal.x),
      grados(rotacionLocal.y),
      grados(rotacionLocal.z),
    ].join("° / ") + "°",

    rotacionMundial: [
      grados(rotacionMundial.x),
      grados(rotacionMundial.y),
      grados(rotacionMundial.z),
    ].join("° / ") + "°",
  });
});

setDiagnosticoHuesosMano(nuevosDiagnosticos);

        const longitudEjes = Math.max(
          tamaño.x,
          tamaño.y,
          tamaño.z,
          0.1
        ) * 0.35;
        
        ejesReferencia = new THREE.AxesHelper(longitudEjes);
        
        ejesReferencia.position.set(0, 0, 0);
        
        escena.add(ejesReferencia);

setJerarquiaHuesos((actuales) =>
  actuales.map((registro) => {
    const hueso = huesos[registro.nombre];

    if (!hueso) return registro;

    const posicionMundo = new THREE.Vector3();

    hueso.getWorldPosition(posicionMundo);

    return {
      ...registro,
      mundoX: Number(posicionMundo.x.toFixed(4)),
      mundoY: Number(posicionMundo.y.toFixed(4)),
      mundoZ: Number(posicionMundo.z.toFixed(4)),
    };
  })
);

        const altura = Math.max(tamaño.y, 0.1);
        const distancia =
          (altura / 2) /
          Math.tan(THREE.MathUtils.degToRad(camara.fov / 2));

        camara.position.set(0, 0, distancia * 1.65);
        camara.lookAt(0, 0, 0);
        camara.near = Math.max(0.01, distancia / 100);
        camara.far = distancia * 100;
        camara.updateProjectionMatrix();

        if (gltf.animations.length > 0) {
          mezclador = new THREE.AnimationMixer(modelo);
          mezclador.clipAction(gltf.animations[0]).play();
          setEstado(
            `EMA cargado: ${cantidadHuesos} huesos y ` +
            `${gltf.animations.length} animaciones disponibles.`
          );
        } else {
          setEstado(
            `EMA cargado: ${cantidadHuesos} huesos y ninguna animación incluida.`
          );
        }
      },
      undefined,
      (error) => {
        console.error("Error al cargar el modelo EMA:", error);
        if (activo) {
          setEstado(
            "No se pudo cargar el modelo. Comprueba el enlace y la conexión."
          );
        }
      }
    );

    const dibujar = () => {
      if (!activo) return;
      fotograma = requestAnimationFrame(dibujar);
      mezclador?.update(reloj.getDelta());
      renderizador.render(escena, camara);
    };

    dibujar();

    return () => {
      activo = false;
      cancelAnimationFrame(fotograma);
      observador.disconnect();
      mezclador?.stopAllAction();

      if (ejesReferencia) {
        escena.remove(ejesReferencia);
        ejesReferencia.geometry.dispose();
        ejesReferencia.material.dispose();
      }

      escena.traverse((objeto) => {
        if (objeto instanceof THREE.Mesh) {
          objeto.geometry.dispose();

          const materiales = Array.isArray(objeto.material)
            ? objeto.material
            : [objeto.material];

          materiales.forEach((material) => material.dispose());
        }
      });

      renderizador.dispose();

      if (contenedor.contains(renderizador.domElement)) {
        contenedor.removeChild(renderizador.domElement);
      }
    };
  }, []);
  const restablecerArticulacion = () => {
    setGiroGrados(0);
  };

  const capturarLecturaArticulacion = () => {
    const hueso = huesosRef.current[huesoSeleccionado];
  
    if (!hueso) {
      setLecturaActualArticulacion(null);
      return;
    }
  
    hueso.updateWorldMatrix(true, false);
  
    const posicionLocal = hueso.position.clone();
  
    const posicionMundial = hueso.getWorldPosition(
      new THREE.Vector3()
    );
  
    const rotacionLocal = hueso.rotation.clone();
  
    const quaternionMundial = hueso.getWorldQuaternion(
      new THREE.Quaternion()
    );
  
    const rotacionMundial = new THREE.Euler().setFromQuaternion(
      quaternionMundial,
      "XYZ"
    );
  
    const grados = (valor: number) =>
      Number(THREE.MathUtils.radToDeg(valor).toFixed(2));
  
    const coordenadas = (vector: THREE.Vector3) =>
      [
        vector.x,
        vector.y,
        vector.z,
      ].map((valor) => Number(valor.toFixed(4))).join(" / ");
  
    const rotaciones = (rotacion: THREE.Euler) =>
      [
        grados(rotacion.x),
        grados(rotacion.y),
        grados(rotacion.z),
      ].join("° / ") + "°";
  
    setLecturaActualArticulacion({
      nombre: hueso.name,
      posicionLocal: coordenadas(posicionLocal),
      posicionMundial: coordenadas(posicionMundial),
      rotacionLocal: rotaciones(rotacionLocal),
      rotacionMundial: rotaciones(rotacionMundial),
      fecha: new Date().toLocaleTimeString("es-CO"),
    });
  };

  const detenerMovimiento = () => {
    reproduccionActivaRef.current = false;
  
    if (fotogramaMovimientoRef.current !== null) {
      cancelAnimationFrame(fotogramaMovimientoRef.current);
      fotogramaMovimientoRef.current = null;
    }
  
    Object.entries(huesosRef.current).forEach(([nombre, hueso]) => {
      const original = rotacionesOriginalesRef.current[nombre];
  
      if (original) {
        hueso.rotation.copy(original);
      }
    });
  
    setReproduciendo(false);
  };
  
  const iniciarMovimiento = (movimientoId: string) => {
    const movimiento = movimientosLSC.find(
      (item) => item.id === movimientoId
    );
  
    if (!movimiento || !movimientoAptoParaPruebas(movimiento)) {
      setEstadoReproductor(
        "Movimiento no autorizado. Revisa sus permisos y validaciones."
      );
      return;
    }
  
    if (!movimiento.secuencia) {
      setEstadoReproductor(
        "El recurso no contiene una secuencia de movimiento."
      );
      return;
    }
  
    const validacion = validarSecuenciaMovimiento(
      movimiento.secuencia,
      nombresHuesos
    );
  
    if (!validacion.valido) {
      setEstadoReproductor(
        `Secuencia no válida: ${validacion.errores.join(" ")}`
      );
      return;
    }
  
    detenerMovimiento();
  
    const secuencia = movimiento.secuencia;
    const inicio = performance.now();
  
    reproduccionActivaRef.current = true;
    setMovimientoSeleccionado(movimientoId);
    setReproduciendo(true);
    setEstadoReproductor(`Reproduciendo: ${movimiento.nombre}`);
  
    const animar = (ahora: number) => {
      if (!reproduccionActivaRef.current) return;
  
      const tiempo = Math.min(
        ahora - inicio,
        secuencia.duracionMs
      );
  
      const rotaciones = obtenerFotogramaInterpolado(
        secuencia,
        tiempo
      );
  
      Object.entries(huesosRef.current).forEach(([nombre, hueso]) => {
        const original = rotacionesOriginalesRef.current[nombre];
        const rotacion = rotaciones[nombre];
  
        if (!original) return;
  
        if (rotacion) {
          hueso.rotation.set(
            original.x + rotacion.x,
            original.y + rotacion.y,
            original.z + rotacion.z
          );
        } else {
          hueso.rotation.copy(original);
        }
      });
  
      if (tiempo >= secuencia.duracionMs) {
        detenerMovimiento();
        setEstadoReproductor(
          "Movimiento finalizado. Postura original restaurada."
        );
        return;
      }
  
      fotogramaMovimientoRef.current =
        requestAnimationFrame(animar);
    };
  
    fotogramaMovimientoRef.current =
      requestAnimationFrame(animar);
  };
  
  useEffect(() => {
    return () => {
      reproduccionActivaRef.current = false;
  
      if (fotogramaMovimientoRef.current !== null) {
        cancelAnimationFrame(fotogramaMovimientoRef.current);
      }
    };
  }, []);
  
  useEffect(() => {
    const hueso = huesosRef.current[huesoSeleccionado];
    const original = rotacionesOriginalesRef.current[huesoSeleccionado];
  
    if (!hueso || !original || reproduciendo) return;
  
    hueso.rotation.copy(original);
    hueso.rotation[eje] =
      original[eje] + (giroGrados * Math.PI) / 180;
    }, [
      huesoSeleccionado,
      eje,
      giroGrados,
      nombresHuesos,
      reproduciendo,
    ]);

  return (
    <section className="lsc-avatar">
      <h3>Conoce a nuestro avatar</h3>
      <p>
        Estamos preparando a nuestro personaje para acompañar
        el aprendizaje de la Lengua de Señas Colombiana.
      </p>

      <div
        ref={contenedorRef}
        className="lsc-avatar-viewer"
        aria-label="Visor del modelo humano 3D"
      />

<section className="lsc-live-hand-monitor">
  <h4>Conexión en directo: MediaPipe → EMA</h4>

  <p>
    Manos recibidas: {manosDetectadas.length}
  </p>

  {manosDetectadas.length === 0 ? (
    <p role="status">
      Esperando coordenadas de las manos...
    </p>
  ) : (
    manosDetectadas.map((mano, indice) => (
      <div key={indice}>
        <h5>Mano detectada {indice + 1}</h5>

        <p>
  Lado identificado:{" "}
  {ladosManosDetectadas[indice] === "Left"
    ? "Izquierda"
    : ladosManosDetectadas[indice] === "Right"
      ? "Derecha"
      : "No identificado"}
</p>

        <p>
          Puntos recibidos: {mano.length} de 21
        </p>

        <ul>
          {mano.map((punto, puntoIndice) => (
            <li key={puntoIndice}>
              Punto {puntoIndice}:{" "}
              X {punto.x.toFixed(3)} —{" "}
              Y {punto.y.toFixed(3)} —{" "}
              Z {punto.z.toFixed(3)}
            </li>
          ))}
        </ul>
      </div>
    ))
  )}

  <p>
    Monitor experimental de coordenadas. La calibración
    anatómica y el movimiento automático aún están pendientes.
  </p>
</section>

<p className="lsc-avatar-status" role="status">
  {estado}
</p>

<section className="lsc-model-diagnostics">
  <h4>Diagnóstico dimensional del modelo EMA</h4>

  {!diagnosticoModelo ? (
    <p>Esperando la carga del modelo 3D...</p>
  ) : (
    <>
      <h5>Dimensiones de la caja del modelo</h5>

      <p>
        Ancho X: {diagnosticoModelo.ancho}
      </p>

      <p>
        Altura Y: {diagnosticoModelo.altura}
      </p>

      <p>
        Profundidad Z: {diagnosticoModelo.profundidad}
      </p>

      <h5>Centro original del modelo</h5>

      <p>
        X: {diagnosticoModelo.centroX}
        {" "}— Y: {diagnosticoModelo.centroY}
        {" "}— Z: {diagnosticoModelo.centroZ}
      </p>

      <h5>Escala del objeto EMA</h5>

      <h5>Orientación mundial del modelo</h5>

{diagnosticoOrientacion ? (
  <>
    <p>
      Rotación X: {diagnosticoOrientacion.rotacionX}°
    </p>

    <p>
      Rotación Y: {diagnosticoOrientacion.rotacionY}°
    </p>

    <p>
      Rotación Z: {diagnosticoOrientacion.rotacionZ}°
    </p>

    <h5>Escala mundial</h5>

    <p>
      X: {diagnosticoOrientacion.escalaX}
      {" "}— Y: {diagnosticoOrientacion.escalaY}
      {" "}— Z: {diagnosticoOrientacion.escalaZ}
    </p>
  </>
) : (
  <p>Calculando orientación del modelo...</p>
)}

      <p>
        X: {diagnosticoModelo.escalaX}
        {" "}— Y: {diagnosticoModelo.escalaY}
        {" "}— Z: {diagnosticoModelo.escalaZ}
      </p>

      <p>
        Las medidas están expresadas en las unidades originales
        del archivo 3D. Todavía no se ha confirmado que sean metros.
      </p>
    </>
  )}
</section>

<section className="lsc-avatar-conceptos">
  <h4>Conceptos para representar</h4>

  {segmentos.length === 0 ? (
    <p>
      Di una frase en la sección Voz a señas para recibir
      sus conceptos.
    </p>
  ) : (
    <>
      <p>
        Concepto {segmentoSeleccionado + 1} de {segmentos.length}
      </p>

      <div className="lsc-avatar-conceptos-lista">
        {segmentos.map((segmento, indice) => (
          
<button
  key={`${segmento.texto}-${indice}`}
  type="button"
  disabled={seleccionDeshabilitada}
  onClick={() => {
    setSegmentoSeleccionado(indice);
    onIndiceSeleccionadoChange?.(indice);
  }}
  aria-pressed={segmentoSeleccionado === indice}
>

            {indice + 1}. {segmento.texto}
          </button>
        ))}
      </div>

      {(() => {
        const segmento = segmentos[segmentoSeleccionado];

        if (!segmento) return null;

        if (!segmento.sena) {
          return (
            <p role="status">
              «{segmento.texto}»: no hay coincidencia
              en el catálogo para este segmento.
            </p>
          );
        }

        const sena = segmento.sena;
        const tieneRecurso = Boolean(
          sena.video || sena.imagen || sena.animacion
        );

        return (
          <div role="status">
            <p>
              <strong>Concepto:</strong> {sena.concepto}
            </p>

            <p>
              <strong>Recurso visual:</strong>{" "}
              {tieneRecurso
                ? "hay un recurso registrado"
                : "pendiente de incorporar"}
            </p>

            {(() => {
  const revision = obtenerEstadoLinguisticoAvatar(sena.id);

  return (
    <div className="lsc-avatar-linguistic-status">
      <p>
        <strong>Estado lingüístico:</strong>{" "}
        {revision.titulo}
      </p>

      <p>{revision.detalle}</p>

      <p>
        <strong>Estado del catálogo:</strong>{" "}
        {sena.estado === "pendiente-validacion"
          ? "Pendiente de validación"
          : sena.estado === "referencia-validada"
            ? "Referencia marcada como validada"
            : "Disponible para práctica"}
      </p>
    </div>
  );
})()}

            <p>
              El avatar todavía no ejecuta una seña automática
              para este concepto.
            </p>
          </div>
        );
      })()}
    </>
  )}
</section>

<details className="lsc-bone-inspector">
  <summary>Ver estructura y jerarquía del avatar</summary>

  <p>
    Huesos detectados: {nombresHuesos.length}
  </p>

  <p>
    Relaciones registradas: {jerarquiaHuesos.length}
  </p>

  <ul>
    {jerarquiaHuesos.map((hueso, indice) => (
      <li key={`${hueso.nombre}-${indice}`}>
        <strong>{hueso.nombre}</strong>

        <p>
          Hueso padre: {hueso.padre}
        </p>

        <small>
          Posición local:
          X {hueso.x} — Y {hueso.y} — Z {hueso.z}
        </small>
      </li>
    ))}
  </ul>

  <p>
    Informe técnico de la estructura del modelo.
    Las relaciones registradas todavía no constituyen
    una calibración anatómica de LSC.
  </p>
</details>

<section className="lsc-hand-rig-report">
  <h4>Diagnóstico de huesos de las manos</h4>

  <p>
    Candidatos detectados por nombre:{" "}
    {huesosManoCandidatos.length}
  </p>

  <p>
    Mano izquierda: {huesosManoIzquierda.length}
  </p>

  <p>
    Mano derecha: {huesosManoDerecha.length}
  </p>

  <p>
    Sin identificación de lado: {huesosManoSinLado.length}
  </p>

  {huesosManoCandidatos.length === 0 ? (
    <p role="status">
      Todavía no se identifican huesos de manos por sus nombres.
      Es necesario revisar la estructura del modelo.
    </p>
  ) : (
    <>
      <p>
        Estos son candidatos identificados por sus nombres.
        Todavía no representan una correspondencia anatómica
        confirmada con los 21 puntos de MediaPipe.
      </p>

      <ul>
        {huesosManoCandidatos.map((nombre, indice) => (
          <li key={`${nombre}-${indice}`}>
            {nombre}
          </li>
        ))}
      </ul>
    </>
  )}
</section>

<details className="lsc-bone-inspector">
  <summary>Diagnóstico tridimensional individual de las manos</summary>

  <p>
    Huesos analizados: {diagnosticoHuesosMano.length}
  </p>

  {diagnosticoHuesosMano.length === 0 ? (
    <p>No se encontraron huesos candidatos para analizar.</p>
  ) : (
    <ul>
      {diagnosticoHuesosMano.map((hueso) => (
        <li key={hueso.nombre}>
          <strong>{hueso.nombre}</strong>

          <p>Hueso padre: {hueso.padre}</p>

          <p>
            Posición local: {hueso.posicionLocal}
          </p>

          <p>
            Posición mundial: {hueso.posicionMundial}
          </p>

          <p>
            Rotación local: {hueso.rotacionLocal}
          </p>

          <p>
            Rotación mundial: {hueso.rotacionMundial}
          </p>
        </li>
      ))}
    </ul>
  )}

  <p>
    Este diagnóstico describe las transformaciones del modelo.
    Todavía no confirma correspondencias anatómicas ni valida
    movimientos de Lengua de Señas Colombiana.
  </p>
</details>

<section className="lsc-hand-mapping-report">
  <h4>Jerarquía real de los huesos de las manos</h4>

  <p>
    Huesos candidatos registrados: {jerarquiaManos.length}
  </p>

  <p>
    Mano izquierda: {jerarquiaManoIzquierda.length}
  </p>

  <p>
    Mano derecha: {jerarquiaManoDerecha.length}
  </p>

  <p>
    Sin identificación de lado: {jerarquiaManosSinLado.length}
  </p>

  {jerarquiaManos.length === 0 ? (
    <p role="status">
      No se han localizado huesos candidatos de las manos
      en la jerarquía del modelo.
    </p>
  ) : (
    <>
      <h5>Relaciones entre huesos</h5>

      <ul>
        {jerarquiaManos.map((hueso, indice) => {
          const hijos = jerarquiaHuesos.filter(
            (elemento) => elemento.padre === hueso.nombre
          );

          return (
            <li key={`${hueso.nombre}-${indice}`}>
              <strong>{hueso.nombre}</strong>

              <p>
                Padre: {hueso.padre}
              </p>

              <p>
                Huesos hijos registrados: {hijos.length}
              </p>

              {hijos.length > 0 && (
                <ul>
                  {hijos.map((hijo) => (
                    <li key={hijo.nombre}>
                      {hijo.nombre}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </>
  )}

  <p role="status">
    Informe basado en los nombres y relaciones reales
    registrados en EMA. Todavía no confirma la
    correspondencia anatómica con MediaPipe ni la
    validez de movimientos en LSC.
  </p>
</section>

<section className="lsc-mapping-lab lsc-reference-postures">
  <h4>Registro de posturas de referencia</h4>

  <p>
    Captura posturas de las manos detectadas por MediaPipe.
    Cada muestra conserva sus 21 puntos de referencia.
  </p>

  <label htmlFor="lsc-reference-side">
    Mano que deseas registrar
  </label>

  <select
    id="lsc-reference-side"
    value={ladoPostura}
    onChange={(evento) =>
      setLadoPostura(
        evento.target.value as "Left" | "Right"
      )
    }
  >
    <option value="Left">Mano izquierda</option>
    <option value="Right">Mano derecha</option>
  </select>

  <label htmlFor="lsc-reference-name">
    Nombre de la postura
  </label>

  <input
    id="lsc-reference-name"
    type="text"
    value={nombrePostura}
    onChange={(evento) =>
      setNombrePostura(evento.target.value)
    }
    placeholder="Ejemplo: Mano abierta"
  />

  <p>
    <strong>Estado de detección:</strong>{" "}
    {manoReferenciaEnVivo?.length === 21
      ? "21 puntos detectados."
      : "Esperando detección de la mano."}
  </p>

  <button
    type="button"
    onClick={capturarPosturaReferencia}
    disabled={
      !nombrePostura.trim() ||
      manoReferenciaEnVivo?.length !== 21
    }
  >
    Capturar postura de referencia
  </button>

  <p role="status">
    {estadoPosturas}
  </p>

  <h5>
    Muestras registradas: {muestrasPosturas.length}
  </h5>

  <button
    type="button"
    onClick={exportarMuestrasPosturas}
    disabled={muestrasPosturas.length === 0}
  >
    Descargar muestras JSON
  </button>

  <button
    type="button"
    onClick={() => {
      setMuestrasPosturas([]);
      setEstadoPosturas(
        "Se solicitó eliminar todas las muestras."
      );
    }}
    disabled={muestrasPosturas.length === 0}
  >
    Borrar todas las muestras
  </button>

  {muestrasPosturas.length === 0 ? (
    <p>
      Todavía no hay posturas registradas.
    </p>
  ) : (
    <ul>
      {muestrasPosturas.map((muestra) => (
        <li key={muestra.id}>
          <strong>{muestra.nombre}</strong>

          <p>
            Mano:{" "}
            {muestra.lado === "Left"
              ? "Izquierda"
              : "Derecha"}
          </p>

          <p>
            Captura:{" "}
            {new Date(
              muestra.fechaCaptura
            ).toLocaleString("es-CO")}
          </p>

          <p>
            Puntos registrados:{" "}
            {muestra.coordenadasNormalizadas.length}
          </p>

          <p>
            Coordenadas 3D:{" "}
            {muestra.coordenadasMundo
              ? "Disponibles"
              : "No disponibles"}
          </p>

          <small>
            Muestra experimental, pendiente de validación.
          </small>

          <button
            type="button"
            onClick={() =>
              eliminarMuestraPostura(muestra.id)
            }
          >
            Eliminar esta muestra
          </button>
        </li>
      ))}
    </ul>
  )}

  <p>
    Estas muestras son referencias técnicas. No representan
    por sí solas señas LSC ni traducciones lingüísticamente
    validadas.
  </p>
</section>

<section className="lsc-mapping-lab">
  <h4>Calibración MediaPipe → EMA</h4>

  <p>
    Asocia manualmente los puntos de la mano detectados
    por MediaPipe con los huesos disponibles del avatar.
    Cada asociación queda pendiente de revisión anatómica.
  </p>

  <label htmlFor="lsc-mapping-side">
    Lado de la mano
  </label>

  <select
    id="lsc-mapping-side"
    value={ladoAsociacion}
    onChange={(evento) =>
      setLadoAsociacion(
        evento.target.value as "Left" | "Right"
      )
    }
  >
    <option value="Left">Izquierda</option>
    <option value="Right">Derecha</option>
  </select>

  <label htmlFor="lsc-mapping-point">
    Punto de MediaPipe
  </label>

  <select
    id="lsc-mapping-point"
    value={puntoAsociacion}
    onChange={(evento) =>
      setPuntoAsociacion(Number(evento.target.value))
    }
  >
    {PUNTOS_MEDIAPIPE.map((nombre, indice) => (
      <option key={indice} value={indice}>
        {indice}: {nombre}
      </option>
    ))}
  
  </select>

<div className="lsc-live-calibration">
  <h5>Lectura del punto seleccionado</h5>

  {puntoAsociacionEnVivo ? (
    <>
      <p>
        <strong>Estado:</strong> Punto detectado en directo.
      </p>

      <p>
        <strong>Punto:</strong>{" "}
        {puntoAsociacion}: {PUNTOS_MEDIAPIPE[puntoAsociacion]}
      </p>

      <p>
        <strong>Coordenada X:</strong>{" "}
        {puntoAsociacionEnVivo.x.toFixed(4)}
      </p>

      <p>
        <strong>Coordenada Y:</strong>{" "}
        {puntoAsociacionEnVivo.y.toFixed(4)}
      </p>

      <p>
        <strong>Coordenada Z:</strong>{" "}
        {puntoAsociacionEnVivo.z.toFixed(4)}
      </p>
      <div className="lsc-world-coordinates">
  <h5>Coordenadas 3D de MediaPipe</h5>

  {puntoMundoAsociacionEnVivo ? (
    <>
      <p>
        <strong>X:</strong>{" "}
        {puntoMundoAsociacionEnVivo.x.toFixed(4)} m
      </p>

      <p>
        <strong>Y:</strong>{" "}
        {puntoMundoAsociacionEnVivo.y.toFixed(4)} m
      </p>

      <p>
        <strong>Z:</strong>{" "}
        {puntoMundoAsociacionEnVivo.z.toFixed(4)} m
      </p>
    </>
  ) : (
    <p role="status">
      Esperando coordenadas tridimensionales.
    </p>
  )}

  <small>
    Coordenadas relativas al centro geométrico de la mano.
    No representan una posición absoluta de la mano ni una
    rotación del esqueleto EMA.
  </small>
</div>
    </>
  ) : (
    <p role="status">
      Esperando la detección de la mano seleccionada.
      Comprueba que la cámara esté activa y que el lado
      coincida con la selección.
    </p>
  )}

  <p>
    <strong>Hueso EMA registrado:</strong>{" "}
    {asociacionActual
      ? asociacionActual.hueso
      : "Este punto todavía no tiene asociación guardada."}
  </p>

  <p>
    <strong>Estado anatómico:</strong>{" "}
    {asociacionActual
      ? "Pendiente de revisión"
      : "Sin asociación"}
  </p>
</div>

<label htmlFor="lsc-mapping-bone">
  Hueso de EMA asociado
</label>

  <select
    id="lsc-mapping-bone"
    value={huesoAsociacion}
    onChange={(evento) =>
      setHuesoAsociacion(evento.target.value)
    }
  >
    <option value="">
      Selecciona un hueso
    </option>

    {huesosManoCandidatos.map((nombre) => (
      <option key={nombre} value={nombre}>
        {nombre}
      </option>
    ))}
  </select>

  <button
    type="button"
    onClick={guardarAsociacion}
    disabled={
      !huesoAsociacion ||
      !huesosRef.current[huesoAsociacion]
    }
  >
    Registrar asociación
  </button>

  <p role="status">
    {estadoAsociaciones}
  </p>

  <h5>
    Asociaciones registradas: {asociacionesMediaPipe.length}
  </h5>

  {asociacionesMediaPipe.length === 0 ? (
    <p>
      Todavía no has registrado asociaciones.
    </p>
  ) : (
    <ul>
      {asociacionesMediaPipe.map((asociacion) => (
        <li key={asociacion.id}>
          <strong>
            {asociacion.lado === "Left"
              ? "Mano izquierda"
              : "Mano derecha"}
          </strong>

          <p>
            Punto {asociacion.punto}:{" "}
            {asociacion.nombrePunto}
          </p>

          <p>
            Hueso EMA: {asociacion.hueso}
          </p>

          <p>
            Estado: Pendiente de revisión anatómica
          </p>

          <button
            type="button"
            onClick={() =>
              eliminarAsociacion(asociacion.id)
            }
          >
            Eliminar asociación
          </button>
        </li>
      ))}
    </ul>
  )}

  <button
    type="button"
    onClick={exportarAsociaciones}
    disabled={asociacionesMediaPipe.length === 0}
  >
    Exportar asociaciones JSON
  </button>

  <p>
    Estas asociaciones son registros técnicos provisionales.
    No activan movimientos automáticos ni representan
    correspondencias anatómicas validadas.
  </p>
</section>

<section className="lsc-motion-player">
  <h4>Reproductor de movimientos LSC</h4>

  <p>
    Este reproductor utiliza secuencias documentadas y
    autorizadas para controlar las articulaciones del avatar.
  </p>

  <label htmlFor="lsc-motion-select">
    Movimiento disponible
  </label>

  <select
    id="lsc-motion-select"
    value={movimientoSeleccionado}
    onChange={(evento) =>
      setMovimientoSeleccionado(evento.target.value)
    }
    disabled={reproduciendo}
  >
    <option value="">Selecciona un movimiento</option>

    {movimientosLSC
      .filter(movimientoAptoParaPruebas)
      .map((movimiento) => (
        <option key={movimiento.id} value={movimiento.id}>
          {movimiento.nombre}
        </option>
      ))}
  </select>

  <div className="lsc-motion-player-buttons">
    <button
      type="button"
      disabled={
        reproduciendo ||
        !movimientosLSC.some(
          (movimiento) =>
            movimiento.id === movimientoSeleccionado &&
            movimientoAptoParaPruebas(movimiento)
        )
      }
      onClick={() => iniciarMovimiento(movimientoSeleccionado)}
    >
      Reproducir movimiento
    </button>

    <button
      type="button"
      onClick={() => {
        detenerMovimiento();
        setEstadoReproductor(
          "Reproducción detenida. Postura original restaurada."
        );
      }}
      disabled={!reproduciendo}
    >
      Detener
    </button>
  </div>

  <p role="status">
    {estadoReproductor}
  </p>

  {movimientosLSC.filter(movimientoAptoParaPruebas).length === 0 && (
    <p>
      Todavía no hay movimientos autorizados para pruebas.
      Los controles se activarán cuando exista una secuencia
      documentada y validada.
    </p>
  )}
</section>
<LSCMotionPreflightReport
  nombresHuesosDisponibles={nombresHuesos}
  emaCargado={nombresHuesos.length > 0}
/>
<section className="lsc-joint-controls">
  <h4>Laboratorio de articulaciones</h4>

  <p>
    Selecciona una articulación y prueba un giro pequeño.
    Esta herramienta es técnica; todavía no representa una seña LSC.
  </p>

  <label htmlFor="lsc-bone-select">
    Articulación
  </label>

  <select
    id="lsc-bone-select"
    value={huesoSeleccionado}
    onChange={(evento) => {
      setHuesoSeleccionado(evento.target.value);
      setGiroGrados(0);
    }}
  >
    
    <optgroup label="Candidatos de las manos">
  {huesosManoCandidatos.map((nombre) => (
    <option key={nombre} value={nombre}>
      {nombre}
    </option>
  ))}
</optgroup>

<optgroup label="Otros huesos del avatar">
  {nombresHuesos
    .filter((nombre) => !huesosManoCandidatos.includes(nombre))
    .map((nombre) => (
      <option key={nombre} value={nombre}>
        {nombre}
      </option>
    ))}
</optgroup>

  </select>

  {jerarquiaHuesoSeleccionado ? (
  <div className="lsc-selected-bone-info">
    <h5>Información del hueso seleccionado</h5>

    <p>
      <strong>Nombre:</strong>{" "}
      {jerarquiaHuesoSeleccionado.nombre}
    </p>

    <p>
      <strong>Padre:</strong>{" "}
      {jerarquiaHuesoSeleccionado.padre}
    </p>

    <p>
      <strong>Posición local:</strong>
      {" "}X {jerarquiaHuesoSeleccionado.x}
      {" "}— Y {jerarquiaHuesoSeleccionado.y}
      {" "}— Z {jerarquiaHuesoSeleccionado.z}
    </p>
    <p>
  <strong>Posición mundial EMA:</strong>
  {" "}X {jerarquiaHuesoSeleccionado.mundoX}
  {" "}— Y {jerarquiaHuesoSeleccionado.mundoY}
  {" "}— Z {jerarquiaHuesoSeleccionado.mundoZ}
</p>
    <p>
      <strong>Huesos hijos:</strong>{" "}
      {hijosHuesoSeleccionado.length}
    </p>

    {hijosHuesoSeleccionado.length > 0 && (
      <ul>
        {hijosHuesoSeleccionado.map((hijo) => (
          <li key={hijo.nombre}>
            {hijo.nombre}
          </li>
        ))}
      </ul>
    )}
  </div>
) : (
  <p role="status">
    Esperando la información del hueso seleccionado.
  </p>
)}

  <label htmlFor="lsc-bone-axis">
    Eje de giro
  </label>

  <select
    id="lsc-bone-axis"
    value={eje}
    onChange={(evento) => {
      setEje(evento.target.value as "x" | "y" | "z");
      setGiroGrados(0);
    }}
  >
    <option value="x">X — adelante / atrás</option>
    <option value="y">Y — lateral</option>
    <option value="z">Z — giro frontal</option>
  </select>

  <label htmlFor="lsc-bone-angle">
    Ángulo de prueba: {giroGrados}°
  </label>

  <input
    id="lsc-bone-angle"
    type="range"
    min="-30"
    max="30"
    step="1"
    value={giroGrados}
    onChange={(evento) =>
      setGiroGrados(Number(evento.target.value))
    }
  />

  <button
    type="button"
    onClick={restablecerArticulacion}
  >
    Restablecer giro
  </button>

  <button
  type="button"
  onClick={capturarLecturaArticulacion}
  disabled={!huesoSeleccionado}
>
  Capturar lectura actual de la articulación
</button>

<details className="lsc-bone-inspector">
  <summary>Última lectura de la articulación</summary>

  {lecturaActualArticulacion ? (
    <>
      <p>
        <strong>Hueso:</strong>{" "}
        {lecturaActualArticulacion.nombre}
      </p>

      <p>
        <strong>Hora de captura:</strong>{" "}
        {lecturaActualArticulacion.fecha}
      </p>

      <h5>Posición local</h5>

      <p>{lecturaActualArticulacion.posicionLocal}</p>

      <h5>Posición mundial</h5>

      <p>{lecturaActualArticulacion.posicionMundial}</p>

      <h5>Rotación local</h5>

      <p>{lecturaActualArticulacion.rotacionLocal}</p>

      <h5>Rotación mundial</h5>

      <p>{lecturaActualArticulacion.rotacionMundial}</p>
    </>
  ) : (
    <p>
      Selecciona una articulación y pulsa Capturar lectura
      para registrar sus transformaciones actuales.
    </p>
  )}
</details>

</section>
    </section>
  );
}
