import { useState, useRef, useEffect } from 'react'
import axios from 'axios'
import YouTube from 'react-youtube'
import { auth, db, googleProvider, signInWithPopup, signOut, onAuthStateChanged } from './firebase'
import { doc, getDoc } from 'firebase/firestore'

function App() {
  // Estados de Seguridad y Usuario
  const [usuario, setUsuario] = useState(null)
  const [esAdmin, setEsAdmin] = useState(false)
  const [accesoAprobado, setAccesoAprobado] = useState(false)
  const [pantallaAdmin, setPantallaAdmin] = useState(false)
  const [solicitudes, setSolicitudes] = useState([])
  const [mensajeAuth, setMensajeAuth] = useState('')

  // Estados de la App
  const [url, setUrl] = useState('')
  const [resultado, setResultado] = useState(null)
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState(null)
  const [pausas, setPausas] = useState([])
  const [pausaActiva, setPausaActiva] = useState(null)
  const [preguntaActiva, setPreguntaActiva] = useState(null)
  const [preguntasDisponibles, setPreguntasDisponibles] = useState([])
  const [respuestaUsuario, setRespuestaUsuario] = useState('')
  const [estadoRespuesta, setEstadoRespuesta] = useState(null)

  const playerRef = useRef(null)
  const pausasProcesadas = useRef([])

  // 1. Lógica de Autenticación
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (user) {
        if (!user.email.endsWith('@gmail.com')) {
          signOut(auth)
          setMensajeAuth('Acceso denegado: Solo se permiten correos @gmail.com')
          return
        }
        
        setUsuario(user)
        
        if (user.email === 'anderssonbeltre@gmail.com') {
          setEsAdmin(true)
          setAccesoAprobado(true)
        } else {
          setEsAdmin(false)
          setMensajeAuth('Verificando autorización...')
          const docSnap = await getDoc(doc(db, 'usuarios_autorizados', user.email))
          
          if (docSnap.exists()) {
            setAccesoAprobado(true)
          } else {
            setAccesoAprobado(false)
            await axios.post('https://panda-agent.onrender.com/solicitar-acceso', { email: user.email })
            setMensajeAuth('Acceso pendiente. El administrador debe aprobar tu cuenta.')
          }
        }
      } else {
        setUsuario(null)
        setEsAdmin(false)
        setAccesoAprobado(false)
      }
    })
    return () => unsub()
  }, [])

  const iniciarSesion = async () => {
    setMensajeAuth('')
    try {
      googleProvider.setCustomParameters({ prompt: 'select_account' })
      await signInWithPopup(auth, googleProvider)
    } catch (err) {
      setMensajeAuth('Error de inicio de sesión.')
    }
  }

  // 2. Lógica del Panel Administrador
  const abrirAdmin = async () => {
    setPantallaAdmin(true)
    const res = await axios.get('https://panda-agent.onrender.com/solicitudes-pendientes')
    setSolicitudes(res.data)
  }

  const gestionarSolicitud = async (email, accion) => {
    await axios.post(`https://panda-agent.onrender.com/${accion}-usuario`, { email })
    const res = await axios.get('https://panda-agent.onrender.com/solicitudes-pendientes')
    setSolicitudes(res.data)
  }

  // 3. Lógica del Video (Tu código original)
  const obtenerVideoId = (enlace) => {
    const match = enlace.match(/(?:v=|\/)([0-9A-Za-z_-]{11}).*/);
    return match ? match[1] : '';
  };

  const procesarVideo = async () => {
    setCargando(true); setError(null); setResultado(null);
    setPausas([]); setPausaActiva(null); setPreguntaActiva(null);
    pausasProcesadas.current = [];
    try {
      const resp = await axios.post('https://panda-agent.onrender.com/procesar-video', { url: url })
      if (resp.data.error) setError(resp.data.error)
      else { setResultado(resp.data); setPausas(resp.data.pausas || []) }
    } catch (err) { setError("Error: " + err.message) } 
    finally { setCargando(false) }
  }

  const tiempoASegundos = (t) => { if (!t) return 0; const p = t.split(':'); return parseInt(p[0]) * 60 + parseInt(p[1]); }

  useEffect(() => {
    if (pausas.length === 0 || pausaActiva) return;
    const intervalo = setInterval(() => {
      if (playerRef.current && typeof playerRef.current.getCurrentTime === 'function') {
        const tActual = playerRef.current.getCurrentTime();
        const pausaEncontrada = pausas.find(p => {
          const s = tiempoASegundos(p.minuto_pausa);
          return tActual >= s && tActual <= s + 1 && !pausasProcesadas.current.includes(p.minuto_pausa);
        });
        if (pausaEncontrada) {
          playerRef.current.pauseVideo();
          pausasProcesadas.current.push(pausaEncontrada.minuto_pausa);
          const pLista = [...pausaEncontrada.preguntas];
          const iSim = pLista.findIndex(p => p.tipo === 'simulador');
          let pElegida = iSim !== -1 ? pLista.splice(iSim, 1)[0] : pLista.splice(Math.floor(Math.random() * pLista.length), 1)[0];
          setPausaActiva(pausaEncontrada); setPreguntasDisponibles(pLista); setPreguntaActiva(pElegida);
          setRespuestaUsuario(''); setEstadoRespuesta(null);
        }
      }
    }, 500);
    return () => clearInterval(intervalo);
  }, [pausas, pausaActiva]);

  const validarRespuesta = (valor) => {
    let esCorrecta = preguntaActiva.tipo === 'completar' ? 
      valor.toLowerCase().trim() === preguntaActiva.respuesta_correcta.toLowerCase().trim() : 
      (valor.charAt(0) === preguntaActiva.respuesta_correcta || valor === preguntaActiva.respuesta_correcta);
    setRespuestaUsuario(valor);
    if (esCorrecta) {
      setEstadoRespuesta('correcta');
      setTimeout(() => { setPausaActiva(null); setPreguntaActiva(null); setEstadoRespuesta(null); playerRef.current.playVideo(); }, 4000);
    } else {
      setEstadoRespuesta('incorrecta');
      setTimeout(() => {
        if (preguntasDisponibles.length > 0) {
          const r = [...preguntasDisponibles];
          const iSim = r.findIndex(p => p.tipo === 'simulador');
          let nP = iSim !== -1 ? r.splice(iSim, 1)[0] : r.splice(Math.floor(Math.random() * r.length), 1)[0];
          setPreguntaActiva(nP); setPreguntasDisponibles(r); setRespuestaUsuario(''); setEstadoRespuesta(null);
        } else {
           setPausaActiva(null); setPreguntaActiva(null); setEstadoRespuesta(null); playerRef.current.playVideo();
        }
      }, 4000);
    }
  }

  // INTERFACES (Renders)

  // Pantalla 1: Login
  if (!usuario) {
    return (
      <div style={{ background: 'linear-gradient(135deg, #0A192F 0%, #000000 100%)', minHeight: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        <div style={{ backgroundColor: 'rgba(0,0,0,0.85)', padding: '40px', borderRadius: '15px', border: '1px solid #FF9800', textAlign: 'center', width: '90%', maxWidth: '400px' }}>
          <h1 style={{ color: '#FF9800', margin: '0 0 10px 0' }}>P&A Agent</h1>
          <p style={{ color: '#DDD', marginBottom: '25px' }}>Inicia sesión para acceder</p>
          {mensajeAuth && <p style={{ color: '#F44336' }}>{mensajeAuth}</p>}
          <button onClick={iniciarSesion} style={{ padding: '12px', width: '100%', backgroundColor: '#FFF', color: '#000', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' }}>
            Continuar con Google
          </button>
        </div>
      </div>
    )
  }

  // Pantalla 2: Acceso Pendiente
  if (!accesoAprobado) {
    return (
      <div style={{ background: 'linear-gradient(135deg, #0A192F 0%, #000000 100%)', minHeight: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        <div style={{ backgroundColor: 'rgba(0,0,0,0.85)', padding: '40px', borderRadius: '15px', border: '1px solid #FF9800', textAlign: 'center', width: '90%', maxWidth: '400px' }}>
          <h2 style={{ color: '#FF9800' }}>Acceso Restringido</h2>
          <p style={{ color: '#FFF' }}>{mensajeAuth}</p>
          <button onClick={() => signOut(auth)} style={{ marginTop: '20px', padding: '10px 20px', backgroundColor: '#F44336', color: '#FFF', border: 'none', borderRadius: '8px', cursor: 'pointer' }}>Salir</button>
        </div>
      </div>
    )
  }

  // Pantalla 3: Panel de Administración
  if (esAdmin && pantallaAdmin) {
    return (
      <div style={{ background: '#0A192F', minHeight: '100vh', padding: '20px', color: '#FFF' }}>
        <button onClick={() => setPantallaAdmin(false)} style={{ backgroundColor: '#FF9800', padding: '10px', border: 'none', borderRadius: '5px', cursor: 'pointer', fontWeight: 'bold' }}>← Volver a la App</button>
        <h2 style={{ color: '#FF9800', marginTop: '20px' }}>Solicitudes Pendientes</h2>
        {solicitudes.length === 0 ? <p>No hay solicitudes nuevas.</p> : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
            {solicitudes.map((s, idx) => (
              <div key={idx} style={{ backgroundColor: '#121212', padding: '15px', borderRadius: '8px', border: '1px solid #4CAF50', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '16px', fontWeight: 'bold' }}>{s.email}</span>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button onClick={() => gestionarSolicitud(s.email, 'aprobar')} style={{ backgroundColor: '#4CAF50', color: '#FFF', padding: '8px 15px', border: 'none', borderRadius: '5px', cursor: 'pointer' }}>Aprobar</button>
                  <button onClick={() => gestionarSolicitud(s.email, 'rechazar')} style={{ backgroundColor: '#F44336', color: '#FFF', padding: '8px 15px', border: 'none', borderRadius: '5px', cursor: 'pointer' }}>Rechazar</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  // Pantalla 4: App Principal
  return (
    <div style={{ background: 'linear-gradient(135deg, #0A192F 0%, #000000 100%)', minHeight: '100vh', padding: '2vw', color: '#FFFFFF', boxSizing: 'border-box' }}>
      
      {/* Cabecera con Botones */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '10px' }}>
        <h1 style={{ color: '#FF9800', margin: 0, textShadow: '0 0 10px rgba(255, 152, 0, 0.8)' }}>P&A Agent</h1>
        <div style={{ display: 'flex', gap: '10px' }}>
          {esAdmin && (
            <button onClick={abrirAdmin} style={{ backgroundColor: '#4CAF50', color: '#FFF', padding: '8px 15px', border: 'none', borderRadius: '5px', cursor: 'pointer', fontWeight: 'bold' }}>Panel Admin</button>
          )}
          <button onClick={() => signOut(auth)} style={{ backgroundColor: '#F44336', color: '#FFF', padding: '8px 15px', border: 'none', borderRadius: '5px', cursor: 'pointer', fontWeight: 'bold' }}>Cerrar Sesión</button>
        </div>
      </div>

      <div style={{ backgroundColor: 'rgba(0,0,0,0.7)', padding: '15px', borderRadius: '15px', marginBottom: '20px', display: 'flex', gap: '15px', justifyContent: 'center' }}>
        <input type="text" placeholder="Pega el enlace de YouTube aquí..." value={url} onChange={(e) => setUrl(e.target.value)} style={{ flex: '1', maxWidth: '800px', padding: '12px', backgroundColor: '#121212', color: '#FFF', border: '1px solid #FF9800', borderRadius: '8px' }} />
        <button onClick={procesarVideo} disabled={cargando} style={{ padding: '12px 30px', backgroundColor: '#FF9800', color: '#000', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' }}>{cargando ? 'Analizando...' : 'Comenzar'}</button>
      </div>

      {/* Aquí sigue tu código exacto de la Zona 2 y Zona 3 (Video y Preguntas) */}
      {resultado && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2vw', width: '100%', alignItems: 'stretch' }}>
          {/* Panel de Video / Simulador */}
          <div style={{ flex: '1.5 1 500px', backgroundColor: '#000', padding: '15px', borderRadius: '15px', border: '1px solid #0A192F', display: 'flex', flexDirection: 'column' }}>
            {preguntaActiva?.tipo === 'simulador' && <h3 style={{ color: '#4CAF50', textAlign: 'center', marginTop: 0 }}>Práctica de Laboratorio Activa</h3>}
            <div style={{ position: 'relative', width: '100%', paddingTop: '56.25%', flex: 1 }}>
              <div style={{ display: preguntaActiva?.tipo === 'simulador' ? 'none' : 'block', position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }}>
                <YouTube videoId={obtenerVideoId(url)} opts={{ width: '100%', height: '100%', playerVars: { autoplay: 1 } }} onReady={(e) => playerRef.current = e.target} style={{ width: '100%', height: '100%' }} />
              </div>
              {preguntaActiva?.tipo === 'simulador' && (
                <iframe src={preguntaActiva.url_simulador} style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', border: 'none', borderRadius: '10px', backgroundColor: '#FFF' }} allowFullScreen></iframe>
              )}
            </div>
          </div>

          {/* Panel de Preguntas */}
          <div style={{ flex: '1 1 300px', backgroundColor: 'rgba(0,0,0,0.8)', padding: '25px', borderRadius: '15px', borderTop: '4px solid #FFC107' }}>
            {!pausaActiva ? (
              <h3 style={{ color: '#FFC107', textAlign: 'center' }}>El video está en reproducción.</h3>
            ) : (
              <div style={{ overflowY: 'auto' }}>
                <h3 style={{ color: '#FFC107', marginTop: '0' }}>Pausa en: {pausaActiva.minuto_pausa}</h3>
                {preguntaActiva.tipo === 'simulador' && <span style={{ backgroundColor: '#4CAF50', padding: '5px', borderRadius: '5px', fontSize: '12px' }}>TAREA PRÁCTICA</span>}
                <p style={{ fontSize: '18px', margin: '15px 0' }}>{preguntaActiva.pregunta}</p>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {(preguntaActiva.tipo === 'opcion_multiple' || preguntaActiva.tipo === 'verdadero_falso' || preguntaActiva.tipo === 'simulador') && (
                    preguntaActiva.opciones.map((o, i) => (
                      <button key={i} onClick={() => !estadoRespuesta && validarRespuesta(o)} style={{ padding: '12px', textAlign: 'left', backgroundColor: '#121212', color: '#FFF', border: `2px solid ${estadoRespuesta && (o.charAt(0) === preguntaActiva.respuesta_correcta || o === preguntaActiva.respuesta_correcta) ? '#4CAF50' : estadoRespuesta && respuestaUsuario === o ? '#F44336' : '#FF9800'}`, borderRadius: '10px', cursor: estadoRespuesta ? 'default' : 'pointer' }}>
                        {o}
                      </button>
                    ))
                  )}
                  {preguntaActiva.tipo === 'completar' && (
                    <input type="text" disabled={estadoRespuesta !== null} placeholder="Respuesta..." onKeyDown={(e) => { if (e.key === 'Enter' && !estadoRespuesta) validarRespuesta(e.target.value) }} style={{ padding: '12px', backgroundColor: '#121212', color: '#FFF', border: `2px solid #FF9800`, borderRadius: '10px', outline: 'none' }} />
                  )}
                </div>

                {estadoRespuesta && (
                  <div style={{ marginTop: '20px', padding: '15px', backgroundColor: 'rgba(18,18,18,0.9)', borderRadius: '10px', borderLeft: `4px solid ${estadoRespuesta === 'correcta' ? '#4CAF50' : '#F44336'}` }}>
                    <p style={{ margin: 0 }}><strong>{estadoRespuesta === 'correcta' ? '¡Excelente! ' : 'Incorrecto. '}</strong> {preguntaActiva.retroalimentacion}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default App