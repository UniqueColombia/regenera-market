"use client";

import { useEffect, useRef } from "react";

/**
 * Capa viva del `HeroBanner`: semillas que suben, luciérnagas que deambulan u
 * hojas pequeñas que caen. Va entre el velo y el texto, y nunca recibe clics.
 *
 * Es cliente por dos razones de la skill `componentizacion`: dibuja en un
 * `<canvas>` (API del navegador) y escucha el puntero. Lo que el servidor manda
 * es un `div` vacío; el lienzo se crea al montar y entra con un fundido, así
 * que sin JavaScript el hero es exactamente el de antes.
 *
 * Cada variante cuenta algo del tema de su página, no decora por decorar:
 *
 * - `semillas` — partículas que suben despacio y se mecen: lo que se planta y
 *   crece. Portada, vender y niveles.
 * - `luciernagas` — puntos cálidos que se encienden y se apagan: comunidad,
 *   territorio de noche. Se acercan un poco al cursor. Comunidad y proveedores.
 * - `hojas` — hojas pequeñas que caen girando y meciéndose, y que el cursor
 *   aparta como una brisa: el bosque visto de cerca, que es donde se hace la
 *   verificación en campo.
 * - `primavera` — las mismas hojas en verdes amarillentos de brote nuevo
 *   (`--color-brote-*`): la portada, la cara del sitio, en tono de estación
 *   que empieza.
 *
 * Inspirado en los fondos de React Bits (https://github.com/DavidHDev/react-bits,
 * Copyright (c) 2026 David Haz, MIT + Commons Clause): se usa dentro del sitio,
 * no se redistribuye. El código de aquí es propio.
 *
 * ## Lo que no es negociable
 *
 * - `prefers-reduced-motion` → un único fotograma quieto. Ni deriva ni cursor.
 * - Fuera de pantalla o con la pestaña oculta, no se anima: un hero que gira
 *   bajo el scroll gasta batería sin que nadie lo vea.
 * - El cursor solo cuenta con hover real; en un teléfono no existe.
 * - Los colores salen de los tokens del tema (`--color-*`), no de un literal.
 */

export type VarianteFondo = "semillas" | "luciernagas" | "hojas" | "primavera";

/** `primavera` es `hojas` con otra paleta: misma física, mismo dibujo. */
const esHoja = (v: VarianteFondo) => v === "hojas" || v === "primavera";

type Particula = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Radio en semillas y luciérnagas; largo de la hoja en `hojas`. */
  r: number;
  fase: number;
  frecuencia: number;
  /** Solo hojas: ángulo actual, cuánto gira por segundo y su color. */
  angulo: number;
  giro: number;
  color: number;
};

/** Cuántas partículas por cada 10 000 px² de hero, con tope. Más allá del tope
    un monitor ancho no gana nada y el teléfono pierde fotogramas. Las hojas van
    más escasas que las semillas a propósito: son más grandes y se leen como
    figura; muchas juntas serían una tormenta, no un bosque. */
const DENSIDAD = { semillas: 0.9, luciernagas: 0.45, hojas: 0.55, primavera: 0.55 } as const;
const TOPE = { semillas: 140, luciernagas: 60, hojas: 70, primavera: 70 } as const;

export function FondoHero({ variante }: { variante: VarianteFondo }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const contenedor = ref.current;
    const hero = contenedor?.parentElement;
    if (!contenedor || !hero) return;

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    canvas.className =
      "absolute inset-0 size-full opacity-0 transition-opacity duration-1000";
    contenedor.appendChild(canvas);

    const reducido = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const conCursor =
      !reducido && window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    const raiz = getComputedStyle(document.documentElement);
    const token = (nombre: string) => raiz.getPropertyValue(nombre).trim();
    const colorSemilla = token("--color-brand-100");
    const colorSemillaB = token("--color-clay-100");
    const colorLuz = token("--color-clay-300");
    /* Verdes de distintas edades y alguna hoja seca: una sola tinta se ve como
       confeti recortado; la mezcla, como un árbol de verdad. */
    const coloresHoja =
      variante === "primavera"
        ? [
            // Brote nuevo, del amarillo pálido al verde lima, y un verde de
            // la marca para que no se lea como un otoño.
            token("--color-brote-100"),
            token("--color-brote-200"),
            token("--color-brote-300"),
            token("--color-brote-400"),
            token("--color-brand-200"),
          ]
        : [
            token("--color-brand-200"),
            token("--color-brand-300"),
            token("--color-brand-100"),
            token("--color-clay-300"),
          ];
    const colorNervio = token("--color-brand-700");

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let ancho = 0;
    let alto = 0;
    let particulas: Particula[] = [];
    const cursor = { x: -9999, y: -9999, dentro: false };

    /* Halo de luciérnaga pintado una vez en un lienzo aparte. Dibujar un
       degradado radial por partícula y por fotograma cuesta diez veces más que
       estampar esta imagen ya hecha. */
    const halo = document.createElement("canvas");
    halo.width = halo.height = 32;
    const hctx = halo.getContext("2d");
    if (hctx) {
      const g = hctx.createRadialGradient(16, 16, 0, 16, 16, 16);
      g.addColorStop(0, colorLuz);
      g.addColorStop(0.25, colorLuz);
      g.addColorStop(1, "transparent");
      hctx.fillStyle = g;
      hctx.fillRect(0, 0, 32, 32);
    }

    const azar = (min: number, max: number) => min + Math.random() * (max - min);

    function nuevaParticula(enCualquierAltura: boolean): Particula {
      const base = { angulo: 0, giro: 0, color: 0 };
      if (variante === "semillas") {
        return {
          ...base,
          x: azar(0, ancho),
          y: enCualquierAltura ? azar(0, alto) : alto + azar(4, 40),
          vx: 0,
          vy: -azar(6, 16), // px por segundo, hacia arriba
          r: azar(0.8, 2.2),
          fase: azar(0, Math.PI * 2),
          frecuencia: azar(0.25, 0.6),
        };
      }
      if (esHoja(variante)) {
        return {
          x: azar(-20, ancho),
          y: enCualquierAltura ? azar(-20, alto) : -azar(10, 60),
          vx: azar(4, 12), // una brisa constante hacia la derecha
          vy: azar(14, 30), // px por segundo, hacia abajo
          r: azar(10, 17),
          fase: azar(0, Math.PI * 2),
          frecuencia: azar(0.5, 1.2),
          angulo: azar(0, Math.PI * 2),
          giro: azar(-1.2, 1.2),
          color: Math.floor(Math.random() * coloresHoja.length),
        };
      }
      return {
        ...base,
        x: azar(0, ancho),
        y: azar(alto * 0.15, alto),
        vx: azar(-8, 8),
        vy: azar(-8, 8),
        r: azar(5, 9),
        fase: azar(0, Math.PI * 2),
        frecuencia: azar(0.3, 0.9),
      };
    }

    function construir() {
      ancho = hero!.clientWidth;
      alto = hero!.clientHeight;
      if (!ancho || !alto) return;
      canvas.width = ancho * dpr;
      canvas.height = alto * dpr;
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      const n = Math.min(
        Math.round(((ancho * alto) / 10000) * DENSIDAD[variante]),
        TOPE[variante],
      );
      particulas = Array.from({ length: n }, () => nuevaParticula(true));
    }

    /**
     * Una hoja: dos curvas que se juntan en punta, y el nervio central.
     *
     * El «aleteo» es lo que la hace hoja y no papel picado: `volteo` es el coseno
     * de su fase y aplasta la hoja de lado a lado, como si girara sobre su eje
     * largo mientras cae. Cuando el coseno pasa por cero se ve de canto, casi una
     * línea; es lo que hace una hoja de verdad.
     */
    function dibujarHoja(p: Particula, volteo: number) {
      const c = ctx!;
      const l = p.r;
      c.save();
      c.translate(p.x, p.y);
      c.rotate(p.angulo);
      c.scale(Math.max(Math.abs(volteo), 0.12), 1);
      c.beginPath();
      c.moveTo(0, -l / 2);
      c.quadraticCurveTo(l * 0.48, -l * 0.05, 0, l / 2);
      c.quadraticCurveTo(-l * 0.48, -l * 0.05, 0, -l / 2);
      c.fillStyle = coloresHoja[p.color];
      c.fill();
      // Nervio y peciolo: un trazo apenas más oscuro que la hoja.
      c.globalAlpha *= 0.55;
      c.strokeStyle = colorNervio;
      c.lineWidth = 0.6;
      c.beginPath();
      c.moveTo(0, -l / 2.4);
      c.lineTo(0, l / 2 + l * 0.18);
      c.stroke();
      c.restore();
    }

    let previo = 0;
    function pintar(t: number) {
      const dt = previo ? Math.min((t - previo) / 1000, 0.05) : 0;
      previo = t;
      const seg = t / 1000;
      ctx!.clearRect(0, 0, ancho, alto);

      if (variante === "semillas") {
        for (const p of particulas) {
          p.y += p.vy * dt;
          // El viento: un vaivén lento, distinto para cada semilla.
          p.x += Math.sin(seg * p.frecuencia + p.fase) * 9 * dt;
          if (p.y < -10) Object.assign(p, nuevaParticula(false));
          // Se desvanecen al subir: las de arriba ya «se fueron».
          const vida = Math.max(0, Math.min(1, p.y / (alto * 0.9)));
          ctx!.globalAlpha = 0.15 + vida * 0.45;
          ctx!.fillStyle = p.r > 1.8 ? colorSemillaB : colorSemilla;
          ctx!.beginPath();
          ctx!.ellipse(p.x, p.y, p.r, p.r * 1.6, Math.sin(seg + p.fase) * 0.6, 0, Math.PI * 2);
          ctx!.fill();
        }
      } else if (esHoja(variante)) {
        for (const p of particulas) {
          // Caída en péndulo: la hoja se desliza de lado a lado, y frena un
          // poco abajo en cada vaivén, en vez de bajar en línea recta.
          const vaiven = Math.sin(seg * p.frecuencia + p.fase);
          p.x += (p.vx + vaiven * 22) * dt;
          p.y += p.vy * (0.75 + 0.25 * Math.abs(vaiven)) * dt;
          p.angulo += (p.giro + vaiven * 0.8) * dt;

          if (cursor.dentro) {
            // La brisa del cursor: las aparta con suavidad, sin arrastrarlas.
            const dx = p.x - cursor.x;
            const dy = p.y - cursor.y;
            const d = Math.hypot(dx, dy);
            if (d < 110 && d > 0.01) {
              const k = (1 - d / 110) * 80 * dt;
              p.x += (dx / d) * k;
              p.y += (dy / d) * k * 0.5;
            }
          }

          if (p.y > alto + 20 || p.x > ancho + 30) Object.assign(p, nuevaParticula(false));

          // Aparecen arriba y se apagan al llegar abajo, donde el hero se
          // funde con la página: que ninguna «aterrice» en un borde recto.
          const entrada = Math.min(1, (p.y + 20) / 80);
          const salida = Math.min(1, (alto - p.y) / (alto * 0.25));
          ctx!.globalAlpha = Math.max(0, Math.min(entrada, salida)) * 0.9;
          dibujarHoja(p, Math.cos(seg * p.frecuencia * 1.6 + p.fase));
        }
      } else {
        for (const p of particulas) {
          // Deambular: la velocidad se tuerce poco a poco, nunca de golpe.
          p.vx += azar(-14, 14) * dt;
          p.vy += azar(-14, 14) * dt;
          if (cursor.dentro) {
            // Curiosas, no pegajosas: un tirón suave hacia el cursor.
            p.vx += (cursor.x - p.x) * 0.06 * dt;
            p.vy += (cursor.y - p.y) * 0.06 * dt;
          }
          p.vx = Math.max(-14, Math.min(14, p.vx * 0.99));
          p.vy = Math.max(-14, Math.min(14, p.vy * 0.99));
          p.x = (p.x + p.vx * dt + ancho) % ancho;
          p.y = Math.max(0, Math.min(alto, p.y + p.vy * dt));
          const brillo = 0.5 + 0.5 * Math.sin(seg * p.frecuencia * 2 + p.fase);
          ctx!.globalAlpha = Math.pow(brillo, 3) * 0.9;
          const d = p.r * 2;
          ctx!.drawImage(halo, p.x - d / 2, p.y - d / 2, d, d);
        }
      }
      ctx!.globalAlpha = 1;
    }

    let raf = 0;
    let visible = true;
    const bucle = (t: number) => {
      pintar(t);
      raf = requestAnimationFrame(bucle);
    };
    const arrancar = () => {
      if (!raf && !reducido && visible && !document.hidden) {
        previo = 0; // que la pausa no cuente como un salto de tiempo
        raf = requestAnimationFrame(bucle);
      }
    };
    const parar = () => {
      cancelAnimationFrame(raf);
      raf = 0;
    };

    construir();
    pintar(performance.now());
    // El fundido de entrada, un fotograma después de pintar el primero.
    requestAnimationFrame(() => (canvas.style.opacity = "1"));

    const alMover = (e: PointerEvent) => {
      const r = hero.getBoundingClientRect();
      cursor.x = e.clientX - r.left;
      cursor.y = e.clientY - r.top;
      cursor.dentro = true;
    };
    const alSalir = () => {
      cursor.dentro = false;
      cursor.x = cursor.y = -9999;
    };
    if (conCursor) {
      hero.addEventListener("pointermove", alMover);
      hero.addEventListener("pointerleave", alSalir);
    }

    const observadorTamano = new ResizeObserver(() => {
      construir();
      if (reducido) pintar(performance.now());
    });
    observadorTamano.observe(hero);

    const observador = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      if (visible) arrancar();
      else parar();
    });
    observador.observe(hero);

    const alCambiarVisibilidad = () => (document.hidden ? parar() : arrancar());
    document.addEventListener("visibilitychange", alCambiarVisibilidad);
    arrancar();

    return () => {
      parar();
      observador.disconnect();
      observadorTamano.disconnect();
      document.removeEventListener("visibilitychange", alCambiarVisibilidad);
      hero.removeEventListener("pointermove", alMover);
      hero.removeEventListener("pointerleave", alSalir);
      canvas.remove();
    };
  }, [variante]);

  return <div ref={ref} aria-hidden className="pointer-events-none absolute inset-0" />;
}
