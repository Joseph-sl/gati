/* =====================================================================
   SCRIPT.JS
   Hace estas cosas:
     1) Avanza cada video según cuánto bajas (scroll).
     2) Mueve las capas de fotos a distintas velocidades (parallax) y la
        galería horizontal.
     3) Conecta los botones de WhatsApp.
     4) Detalles: luz de fondo que sigue al video (computador y celular), cabecera
        que se oscurece al bajar, botón flotante y aparición suave de textos.

   Lo normal es que solo cambies la sección 1 (CONFIG).
   La velocidad de cada escena se ajusta en index.html (data-screens,
   data-speed, data-smooth). Aquí están los valores por defecto.
   ===================================================================== */
(() => {
  "use strict";

  /* ============================ 1) CONFIG ============================ */
  const CONFIG = {
    // Número de WhatsApp con código de país y SIN "+" ni espacios (Chile = 56).
    whatsapp: "56952232906",

    // Mensaje que se escribe solo cuando alguien toca un botón de contacto.
    mensaje: "Hola 👋 Vi la página de Rascadores Zukini y me gustaría cotizar un mueble para mi gato.",

    // Mensaje de los botones "Cotizar" de cada producto ({producto} = el nombre de data-wa en index.html).
    mensajeProducto: "Hola 👋 Vi la página de Rascadores Zukini y me interesa cotizar: {producto}.",

    // Valores por defecto para TODAS las escenas de video
    // (cada escena puede sobreescribirlos con data-smooth / data-speed):
    suavizado: 0.12,   // 0.03 = muy suave y lento en reaccionar · 1 = sin suavizado
    velocidad: 1,      // 1 = el video dura toda la escena · 2 = el doble de rápido · 0.5 = la mitad

    // Velocidad del desvanecido de los textos (en fracción de la escena).
    // Más grande = el texto aparece y se va más despacio.
    fadeTexto: 0.06,

    // Cuánto antes de llegar a una escena empieza a descargarse su video.
    // "200%" = cuando falta 2 pantallas para llegar. Súbelo si ves cortes.
    margenCarga: "200%",

    // false = desactiva el efecto parallax de las fotos
    parallax: true,

    // false = desactiva la luz de fondo que sigue al video
    luzDeFondo: true,
  };


  /* ============================ 2) UTILIDADES ============================ */
  const clamp = (v, min = 0, max = 1) => Math.min(max, Math.max(min, v));
  const num = (v, def) => {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : def;
  };

  // Respeta a quien tiene activado "reducir movimiento" en su dispositivo:
  // no se anima el video ni el parallax (se ve la foto "poster" del video).
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduceMotion) document.documentElement.classList.add("reduce-motion");


  /* ============================ 3) BOTONES DE WHATSAPP ============================ */
  // Todo enlace con data-contact (mensaje general) o data-wa="producto" (mensaje del producto)
  document.querySelectorAll("[data-contact], [data-wa]").forEach((a) => {
    const producto = a.dataset.wa;
    const texto = producto
      ? CONFIG.mensajeProducto.replace("{producto}", producto)
      : CONFIG.mensaje;
    a.href = `https://wa.me/${CONFIG.whatsapp}?text=${encodeURIComponent(texto)}`;
    a.target = "_blank";
    a.rel = "noopener";
  });


  /* ============================ 4) ESCENAS DE VIDEO ============================ */
  // En pantalla horizontal (marco al costado) y en celular vertical (video sin recortar)
  // se dibuja una luz difuminada detrás del video: mismos criterios que en style.css.
  const conLuz = window.matchMedia("(min-aspect-ratio: 1/1) and (min-width: 700px), (max-aspect-ratio: 9/16)");

  const scenes = Array.from(document.querySelectorAll(".scene")).map((section) => {
    const stage = section.querySelector(".stage");
    const video = section.querySelector("video");
    const luz = section.querySelector(".ambient");

    // Cuántas "pantallas" de scroll dura la escena (data-screens)
    section.style.setProperty("--screens", num(section.dataset.screens, 4));

    // Textos con data-show="inicio-fin"
    const captions = Array.from(section.querySelectorAll(".caption")).map((el) => {
      const r = (el.dataset.show || "").split("-").map(parseFloat);
      const ok = r.length === 2 && r.every(Number.isFinite);
      return { el, from: ok ? r[0] : 0, to: ok ? r[1] : 1 };
    });

    return {
      section, stage, video, captions,
      luz: CONFIG.luzDeFondo && luz ? luz.getContext("2d") : null,
      luzW: luz ? luz.width : 0,
      luzH: luz ? luz.height : 0,
      velocidad: num(section.dataset.speed, CONFIG.velocidad),
      suavizado: clamp(num(section.dataset.smooth, CONFIG.suavizado), 0.01, 1),
      inicio: Math.max(0, num(section.dataset.start, 0)),
      fin: num(section.dataset.end, 0),
      t: null,         // tiempo (segundos) suavizado
      lastSet: null,   // último tiempo enviado al video
    };
  });

  // Copia el cuadro actual del video a un canvas diminuto; el CSS lo agranda y lo difumina
  function dibujarLuz(scene) {
    if (!scene.luz || !conLuz.matches || scene.video.readyState < 2) return;
    try {
      scene.luz.drawImage(scene.video, 0, 0, scene.luzW, scene.luzH);
    } catch (e) {
      scene.luz = null;   // el navegador no deja leer este video: se apaga la luz y listo
    }
  }
  conLuz.addEventListener("change", () => scenes.forEach(dibujarLuz));

  // Carga perezosa: el video solo se descarga cuando se acerca a la pantalla
  function cargarVideo(scene) {
    const video = scene.video;
    if (!video || video.dataset.cargado) return;
    video.dataset.cargado = "1";
    const src = video.dataset.src;
    if (!src) return;

    video.addEventListener("loadedmetadata", requestTick, { once: true });
    video.addEventListener("loadeddata", () => dibujarLuz(scene), { once: true });
    video.addEventListener("seeked", () => dibujarLuz(scene));
    video.addEventListener("error", () => {
      scene.section.classList.add("no-video");
      scene.stage.dataset.missing = src;
    }, { once: true });

    // Aviso útil si pruebas en local con un servidor que no soporta "Range":
    // el video cargaría pero no podría saltar, y no avanzaría con el scroll.
    video.addEventListener("canplay", () => {
      const sk = video.seekable;
      if (!sk.length || sk.end(sk.length - 1) < video.duration - 0.5) {
        console.warn("[video con scroll] El servidor no permite saltar dentro del video " +
          "(no soporta peticiones Range), así que no avanzará con el scroll. " +
          "Prueba en local con: python3 servidor.py (GitHub Pages sí lo soporta).");
      }
    }, { once: true });

    video.src = src;
    video.load();
  }

  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        const scene = scenes.find((s) => s.section === e.target);
        if (scene) cargarVideo(scene);
        io.unobserve(e.target);
      });
    }, { rootMargin: `${CONFIG.margenCarga} 0px` });
    scenes.forEach((s) => io.observe(s.section));
  } else {
    scenes.forEach(cargarVideo);
  }

  // Textos: aparecen/desaparecen según el progreso (p) de la escena
  function actualizarTextos(scene, p) {
    const f = Math.max(0.001, CONFIG.fadeTexto);
    scene.captions.forEach(({ el, from, to }) => {
      let o = 1;
      if (from > 0) o = Math.min(o, clamp((p - from) / f));
      if (to < 1) o = Math.min(o, clamp((to - p) / f));
      el.style.opacity = o.toFixed(3);
      el.style.transform = `translate3d(0, ${((1 - o) * 24).toFixed(1)}px, 0)`;
      el.style.visibility = o <= 0 ? "hidden" : "visible";
    });
  }

  // Devuelve true si la escena todavía se está "acomodando" (hay que seguir animando)
  function actualizarEscena(scene, dt, vh) {
    const rect = scene.section.getBoundingClientRect();
    const total = Math.max(1, scene.section.offsetHeight - scene.stage.offsetHeight);
    const p = clamp(-rect.top / total);               // progreso de la escena: 0 → 1
    const visible = rect.bottom > 0 && rect.top < vh;

    if (visible) actualizarTextos(scene, p);

    const v = scene.video;
    if (reduceMotion || !v || !(v.readyState >= 1) || !(v.duration > 0)) return false;

    // Tramo del video que se usa
    const dur = v.duration;
    const from = clamp(scene.inicio, 0, dur);
    const hasta = (scene.fin > 0 ? Math.min(scene.fin, dur) : dur) - 0.04;
    const to = Math.max(from, hasta);

    // Segundo del video que corresponde al scroll actual
    const target = from + (to - from) * clamp(p * scene.velocidad);

    if (scene.t === null || !visible) {
      scene.t = target;                                // fuera de pantalla: sin suavizado
    } else {
      const k = 1 - Math.pow(1 - scene.suavizado, dt * 60);
      scene.t += (target - scene.t) * k;
      if (Math.abs(target - scene.t) < 0.003) scene.t = target;
    }

    // Mover el video (solo si no está ocupado buscando otro cuadro)
    if (visible && scene.t !== scene.lastSet && !v.seeking) {
      if (Math.abs(v.currentTime - scene.t) > 0.01) v.currentTime = scene.t;
      scene.lastSet = scene.t;
    }

    return visible && (scene.t !== target || scene.t !== scene.lastSet);
  }


  /* ============================ 5) GALERÍA HORIZONTAL ============================ */
  const hscrolls = Array.from(document.querySelectorAll(".hscroll")).map((section) => {
    section.style.setProperty("--screens", num(section.dataset.screens, 3));
    return {
      section,
      stage: section.querySelector(".stage"),
      track: section.querySelector(".track"),
      suavizado: clamp(num(section.dataset.smooth, CONFIG.suavizado), 0.01, 1),
      x: null,
    };
  });

  function actualizarGaleria(h, dt, vh) {
    const rect = h.section.getBoundingClientRect();
    if (rect.bottom < 0 || rect.top > vh) return false;

    const total = Math.max(1, h.section.offsetHeight - h.stage.offsetHeight);
    const p = clamp(-rect.top / total);
    const max = Math.max(0, h.track.offsetWidth - h.stage.clientWidth);
    const target = -p * max;

    if (h.x === null) h.x = target;
    const k = 1 - Math.pow(1 - h.suavizado, dt * 60);
    h.x += (target - h.x) * k;
    if (Math.abs(target - h.x) < 0.3) h.x = target;

    h.track.style.transform = `translate3d(${h.x.toFixed(1)}px, 0, 0)`;
    h.section.style.setProperty("--p", max > 0 ? (-h.x / max).toFixed(3) : 0);   // barrita de avance
    return h.x !== target;
  }


  /* ============================ 6) PARALLAX DE FOTOS ============================ */
  const parallaxSecs = Array.from(document.querySelectorAll(".parallax")).map((section) => ({
    section,
    items: Array.from(section.querySelectorAll("[data-parallax]")).map((el) => ({
      el,
      speed: num(el.dataset.parallax, 0),
      zoom: num(el.dataset.zoom, 0),
    })),
  }));

  function actualizarParallax(ps, vh) {
    if (!CONFIG.parallax || reduceMotion) return;
    const rect = ps.section.getBoundingClientRect();
    if (rect.bottom < -50 || rect.top > vh + 50) return;

    const offset = rect.top + rect.height / 2 - vh / 2;        // distancia al centro de la pantalla
    const prog = clamp((vh - rect.top) / (vh + rect.height));  // 0 al entrar → 1 al salir

    ps.items.forEach(({ el, speed, zoom }) => {
      const y = (-offset * speed).toFixed(1);
      const s = (1 + zoom * prog).toFixed(4);
      el.style.transform = `translate3d(0, ${y}px, 0) scale(${s})`;
    });
  }


  /* ============================ 7) BARRA DE PROGRESO, CABECERA Y BOTÓN FLOTANTE ============================ */
  const bar = document.getElementById("progress");
  const topbar = document.getElementById("top");
  const waFloat = document.getElementById("wa-float");

  function actualizarBarra() {
    const y = window.scrollY;
    if (bar) {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      bar.style.transform = `scaleX(${max > 0 ? clamp(y / max) : 0})`;
    }
    if (topbar) topbar.classList.toggle("solid", y > 40);
    if (waFloat) waFloat.classList.toggle("show", y > window.innerHeight * 0.6);
  }


  /* ============================ 8) APARICIÓN SUAVE AL LLEGAR ============================ */
  // Elementos con class="reveal": se les agrega "in" cuando entran a la pantalla
  const reveals = Array.from(document.querySelectorAll(".reveal"));
  if ("IntersectionObserver" in window && !reduceMotion) {
    const ro = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        e.target.classList.add("in");
        ro.unobserve(e.target);
      });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.12 });
    reveals.forEach((el) => ro.observe(el));
  } else {
    reveals.forEach((el) => el.classList.add("in"));
  }


  /* ============================ 9) BUCLE DE ANIMACIÓN ============================ */
  // Solo se ejecuta mientras haya algo que mover (no gasta batería en reposo)
  let raf = 0;
  let last = performance.now();

  function frame(now) {
    raf = 0;
    const dt = Math.min(0.1, Math.max(0.001, (now - last) / 1000));
    last = now;
    const vh = window.innerHeight;
    let busy = false;

    for (const s of scenes) if (actualizarEscena(s, dt, vh)) busy = true;
    for (const h of hscrolls) if (actualizarGaleria(h, dt, vh)) busy = true;
    for (const ps of parallaxSecs) actualizarParallax(ps, vh);
    actualizarBarra();

    if (busy) raf = requestAnimationFrame(frame);
  }

  function requestTick() {
    if (raf) return;
    last = performance.now() - 16;
    raf = requestAnimationFrame(frame);
  }

  window.addEventListener("scroll", requestTick, { passive: true });
  window.addEventListener("resize", requestTick);
  window.addEventListener("load", requestTick);
  window.addEventListener("pageshow", requestTick);
  requestTick();


  /* ============================ 10) AJUSTE PARA iPHONE / iPAD ============================ */
  // Safari en iOS a veces necesita un primer toque para "despertar" los videos.
  function despertarVideos() {
    scenes.forEach((s) => {
      const v = s.video;
      if (!v || !v.src) return;
      const pr = v.play();
      if (pr && pr.then) pr.then(() => v.pause()).catch(() => {});
    });
    setTimeout(() => {
      scenes.forEach((s) => { s.lastSet = null; });
      requestTick();
    }, 400);
  }
  window.addEventListener("touchstart", despertarVideos, { once: true, passive: true });
})();
