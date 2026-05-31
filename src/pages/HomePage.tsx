import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiRequest } from '../api/http';
import { useAuth } from '../auth/AuthContext';
import logoImage from '../assets/logo.png';
import quienesSomos1 from '../assets/quienes-somos-1.png';
import quienesSomos2 from '../assets/quienes-somos-2.png';
import quienesSomos3 from '../assets/quienes-somos-3.png';
import type { CenterInfo } from '../types';

const mapsUrl = 'https://www.google.com/maps?q=2.426573808933907,-76.56853323278717';
const embedMapsUrl =
  'https://www.google.com/maps?q=2.426573808933907,-76.56853323278717&z=16&output=embed';

const fallbackInfo: CenterInfo = {
  name: 'Piedrazul - Centro Médico',
  tagline: 'Reserva tus citas médicas de forma clara y sencilla',
  address: 'Kilómetro 5 vía al Huila, Popayán, Cauca',
  phone: '312 6069041',
  attentionHours: 'Lunes a viernes de 7:00 a.m. a 1:00 p.m.',
  about:
    'Centro médico alternativo orientado a una experiencia humana, cercana y usable para pacientes y personal interno.',
};

const valueCards = [
  {
    title: 'Experiencia',
    description: 'Más de 15 años brindando atención médica de calidad.',
    icon: '🛡️',
  },
  {
    title: 'Compromiso',
    description: 'Dedicados al bienestar y la salud integral de nuestros pacientes.',
    icon: '💙',
  },
  {
    title: 'Equipo',
    description: 'Profesionales altamente calificados y especializados.',
    icon: '👥',
  },
];

const galleryItems = [
  {
    title: 'Un equipo humano y cercano',
    description: 'Profesionales y pacientes que comparten una atención cálida, respetuosa y centrada en el bienestar.',
    image: quienesSomos1,
    alt: 'Equipo y pacientes de Piedrazul reunidos en el centro médico',
  },
  {
    title: 'Profesionales que te acompañan',
    description: 'Nuestro personal médico trabaja de manera interdisciplinaria para brindar una atención integral.',
    image: quienesSomos2,
    alt: 'Profesionales de Piedrazul frente al centro médico',
  },
  {
    title: 'Un espacio tranquilo y natural',
    description: 'Contamos con un entorno campestre pensado para una experiencia de salud serena y acogedora.',
    image: quienesSomos3,
    alt: 'Casa campestre del centro médico Piedrazul',
  },
];

export function HomePage() {
  const { session } = useAuth();
  const [info, setInfo] = useState<CenterInfo>(fallbackInfo);
  const [activeSlide, setActiveSlide] = useState(0);

  useEffect(() => {
    apiRequest<CenterInfo>('/api/public/info', null)
      .then(setInfo)
      .catch(() => setInfo(fallbackInfo));
  }, []);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setActiveSlide((current) => (current + 1) % galleryItems.length);
    }, 5000);

    return () => window.clearInterval(intervalId);
  }, []);

  const hasPatientSession = session?.roles.includes('Patient') ?? false;
  const currentSlide = useMemo(() => galleryItems[activeSlide] ?? galleryItems[0], [activeSlide]);

  const goToPrevSlide = () => {
    setActiveSlide((current) => (current === 0 ? galleryItems.length - 1 : current - 1));
  };

  const goToNextSlide = () => {
    setActiveSlide((current) => (current === galleryItems.length - 1 ? 0 : current + 1));
  };

  return (
    <div className="stack-lg home-page">

      <section className="hero-card hero-card-enhanced hero-card-brand">
        <div className="hero-copy">
          <span className="eyebrow">Centro médico · Reserva en línea</span>
          <h1>{info.name}</h1>
          <p className="hero-text">{info.tagline}</p>
          <p className="muted-text">{info.about}</p>
          <div className="hero-actions">
            <Link className="button" to="/reservar">
              Reservar cita
            </Link>
            {!hasPatientSession && (
              <Link className="button button-secondary" to="/iniciar-sesion">
                Iniciar sesión
              </Link>
            )}
          </div>

          <div className="info-strip info-strip-single">
            <div className="info-chip large">
              <strong>Horario de atención</strong>
              <span>{info.attentionHours}</span>
            </div>
          </div>
        </div>

        <div className="hero-visual hero-logo-card">
          <img src={logoImage} alt="Logo de Piedrazul Centro Médico Alternativo" />
        </div>
      </section>

      <section className="section-card who-we-are-section">
        <div className="section-heading between carousel-heading">
          <div>
            <span className="eyebrow">Quiénes somos</span>
            <h2>Conoce a Piedrazul</h2>
            <p className="muted-text max-width-sm">
              Somos un centro médico alternativo con enfoque humano, un equipo profesional interdisciplinario y un
              espacio diseñado para acompañar tu bienestar.
            </p>
          </div>
          <div className="carousel-controls">
            <button className="button button-secondary carousel-button" type="button" onClick={goToPrevSlide}>
              ←
            </button>
            <button className="button button-secondary carousel-button" type="button" onClick={goToNextSlide}>
              →
            </button>
          </div>
        </div>

        <div className="carousel-card">
          <div className="carousel-visual">
            <img src={currentSlide.image} alt={currentSlide.alt} />
          </div>
          <div className="carousel-copy">
            <h3>{currentSlide.title}</h3>
            <p className="muted-text">{currentSlide.description}</p>
            <div className="carousel-dots" aria-label="Seleccionar imagen del carrusel">
              {galleryItems.map((item, index) => (
                <button
                  key={item.title}
                  type="button"
                  className={`carousel-dot ${index === activeSlide ? 'active' : ''}`}
                  aria-label={`Ver imagen ${index + 1}: ${item.title}`}
                  onClick={() => setActiveSlide(index)}
                />
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="section-card values-section">
        <div className="values-grid">
          {valueCards.map((card) => (
            <article key={card.title} className="value-card">
              <div className="value-card-icon" aria-hidden="true">
                <span>{card.icon}</span>
              </div>
              <h3>{card.title}</h3>
              <p className="muted-text">{card.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="section-card story-card">
        <div className="story-copy stack-sm">
          <span className="eyebrow">Espacio Piedrazul</span>
          <h2>Un entorno campestre pensado para sanar con calma</h2>
          <p className="muted-text">
            Integramos atención médica, terapias y bienestar en un lugar acogedor, rodeado de naturaleza y diseñado
            para que cada visita se sienta cercana y tranquila.
          </p>
          <div className="inline-actions wrap">
            <a className="button" href={mapsUrl} target="_blank" rel="noreferrer noopener">
              Ver ubicación
            </a>
            <Link className="button button-secondary" to="/reservar">
              Agendar una cita
            </Link>
          </div>
        </div>
        <div className="story-visual">
          <img src={quienesSomos3} alt="Vista exterior del centro médico Piedrazul" />
        </div>
      </section>

      <section className="section-card location-section">
        <div className="section-heading centered">
          <span className="eyebrow">Ubicación</span>
          <h2>¿Dónde estamos?</h2>
          <p className="muted-text">Encuéntranos fácilmente en Popayán, Cauca. Ubicación exacta: 2.426573808933907, -76.56853323278717</p>
        </div>

        <div className="location-layout">
          <div className="map-frame-wrap">
            <iframe
              className="map-frame"
              title="Mapa de ubicación de Piedrazul"
              src={embedMapsUrl}
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
            />
          </div>

          <div className="location-cards">
            <article className="location-card">
              <div className="location-icon" aria-hidden="true">📍</div>
              <div>
                <h3>Dirección</h3>
                <p>2.426573808933907, -76.56853323278717</p>
                <a href={mapsUrl} target="_blank" rel="noreferrer noopener">
                  Abrir en Google Maps
                </a>
              </div>
            </article>

            <article className="location-card">
              <div className="location-icon" aria-hidden="true">📞</div>
              <div>
                <h3>Teléfono</h3>
                <a href="tel:3126069041">{info.phone}</a>
              </div>
            </article>

          </div>
        </div>
      </section>

      {!hasPatientSession && (
        <section className="section-card cta-banner">
          <div>
            <span className="eyebrow">Acceso seguro</span>
            <h2>¿Ya tienes una cuenta?</h2>
            <p className="muted-text">Inicia sesión para consultar tus citas o actualizar tus datos antes de reservar.</p>
          </div>
          <div className="inline-actions wrap">
            <Link className="button button-secondary" to="/iniciar-sesion">
              Iniciar sesión
            </Link>
            <Link className="button" to="/crear-cuenta">
              Crear cuenta
            </Link>
          </div>
        </section>
      )}
    </div>
  );
}
