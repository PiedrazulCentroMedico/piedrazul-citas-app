import { Link } from 'react-router-dom';
import { WhatsAppButton } from '../components/WhatsAppButton';

const generalFaqs = [
  {
    question: '¿Cómo reservo una cita?',
    answer: 'Entra a Reservar cita, verifica tu cédula, completa tus datos, selecciona especialidad, profesional, fecha y una hora disponible.',
  },
  {
    question: '¿Puedo reprogramar mi cita?',
    answer: 'Sí. Desde Mi portal abre Mis citas y usa Reprogramar cita. Debe mantenerse la misma especialidad; puedes cambiar de profesional dentro de esa especialidad.',
  },
  {
    question: '¿Qué pasa si necesito cambiar de especialidad?',
    answer: 'Primero cancela la cita actual y luego agenda una cita nueva en la especialidad correcta.',
  },
  {
    question: '¿Por qué no veo más semanas disponibles?',
    answer: 'Cada profesional tiene una ventana máxima de agenda. La última semana se muestra como aviso y queda bloqueada para evitar reservas fuera del límite.',
  },
  {
    question: '¿Dónde veo el historial de reprogramaciones?',
    answer: 'En Mi portal, dentro de Mis citas, usa Ver historial para revisar fecha anterior, nueva fecha, motivo y responsable del cambio.',
  },
  {
    question: '¿La fecha de nacimiento es obligatoria?',
    answer: 'Sí. El sistema valida que el paciente sea mayor de edad y no supere los 100 años. Si tiene más de 80 años muestra una advertencia para confirmar que el dato esté correcto.',
  },
  {
    question: '¿Qué hago si no distingo bien los colores?',
    answer: 'Usa la ayuda visual. Las opciones también muestran texto como Disponible, Seleccionado o No disponible.',
  },
  {
    question: '¿La sesión se cierra sola?',
    answer: 'Sí. Por seguridad, la sesión se cierra después de 20 minutos sin actividad.',
  },
];

export function FaqPage({ mode = 'patient' }: { mode?: 'patient' | 'internal' }) {
  return (
    <div className="stack-lg">
      <section className="section-card faq-hero">
        <span className="eyebrow">Centro de ayuda</span>
        <h1>Preguntas frecuentes</h1>
        <p className="muted-text">Consulta aquí las dudas generales sobre reserva, reprogramación, datos del paciente y seguridad.</p>
        <div className="inline-actions wrap">
          <Link className="button" to="/reservar">Reservar cita</Link>
          <WhatsAppButton href="https://wa.me/573001112233" label="Ayuda por WhatsApp" />
          <Link className="button button-secondary" to={mode === 'internal' ? '/portal/interno/citas' : '/portal/paciente'}>{mode === 'internal' ? 'Volver al portal interno' : 'Ir a mi portal'}</Link>
        </div>
      </section>

      <section className="section-card">
        <div className="faq-grid faq-grid-wide">
          {generalFaqs.map((item) => (
            <details key={item.question} open={item.question === '¿Cómo reservo una cita?'}>
              <summary>{item.question}</summary>
              <p>{item.answer}</p>
            </details>
          ))}
        </div>
      </section>
    </div>
  );
}
