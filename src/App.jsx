import { useState, useRef, useEffect } from 'react'
import axios from 'axios'
import YouTube from 'react-youtube'

function App() {
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

  // Estado del Tutorial Nativo
  const [mostrarTutorial, setMostrarTutorial] = useState(() => {
    return localStorage.getItem('pandaTutorialOmitido') !== 'true';
  });

  const playerRef = useRef(null)
  const pausasProcesadas = useRef([])

  const cerrarTutorial = () => {
    setMostrarTutorial(false);
    localStorage.setItem('pandaTutorialOmitido', 'true');
  };

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
      else {
        setResultado(resp.data)
        setPausas(resp.data.pausas || [])
      }
    } catch (err) {
      setError("Error de conexión: " + err.message)
    } finally {
      setCargando(false)
    }
  }

  const tiempoASegundos = (tiempo) => {
    if (!tiempo) return 0;
    const partes = tiempo.split(':');
    return parseInt(partes[0], 10) * 60 + parseInt(partes[1], 10);
  }

  useEffect(() => {
    if (pausas.length === 0 || pausaActiva) return;

    const intervalo = setInterval(() => {
      if (playerRef.current && typeof playerRef.current.getCurrentTime === 'function') {
        const tiempoActual = playerRef.current.getCurrentTime();
        
        const pausaEncontrada = pausas.find(p => {
          const segs = tiempoASegundos(p.minuto_pausa);
          return tiempoActual >= segs && tiempoActual <= segs + 1 && !pausasProcesadas.current.includes(p.minuto_pausa);
        });

        if (pausaEncontrada) {
          playerRef.current.pauseVideo();
          pausasProcesadas.current.push(pausaEncontrada.minuto_pausa);
          
          const preguntasLista = [...pausaEncontrada.preguntas];
          const indiceSimulador = preguntasLista.findIndex(p => p.tipo === 'simulador');
          
          let preguntaElegida;
          if (indiceSimulador !== -1) {
            preguntaElegida = preguntasLista.splice(indiceSimulador, 1)[0];
          } else {
            const indiceAzar = Math.floor(Math.random() * preguntasLista.length);
            preguntaElegida = preguntasLista.splice(indiceAzar, 1)[0];
          }

          setPausaActiva(pausaEncontrada);
          setPreguntasDisponibles(preguntasLista);
          setPreguntaActiva(preguntaElegida);
          setRespuestaUsuario('');
          setEstadoRespuesta(null);
        }
      }
    }, 500);

    return () => clearInterval(intervalo);
  }, [pausas, pausaActiva]);

  const validarRespuesta = (valorRespuesta) => {
    let esCorrecta = false;
    if (preguntaActiva.tipo === 'completar') {
      esCorrecta = valorRespuesta.toLowerCase().trim() === preguntaActiva.respuesta_correcta.toLowerCase().trim();
    } else {
      const letraIngresada = valorRespuesta.charAt(0);
      esCorrecta = letraIngresada === preguntaActiva.respuesta_correcta || valorRespuesta === preguntaActiva.respuesta_correcta;
    }

    setRespuestaUsuario(valorRespuesta);

    if (esCorrecta) {
      setEstadoRespuesta('correcta');
      setTimeout(() => {
        setPausaActiva(null);
        setPreguntaActiva(null);
        setEstadoRespuesta(null);
        playerRef.current.playVideo();
      }, 4000);
    } else {
      setEstadoRespuesta('incorrecta');
      setTimeout(() => {
        if (preguntasDisponibles.length > 0) {
          const restantes = [...preguntasDisponibles];
          
          const indiceSimulador = restantes.findIndex(p => p.tipo === 'simulador');
          let nuevaPregunta;
          if (indiceSimulador !== -1) {
            nuevaPregunta = restantes.splice(indiceSimulador, 1)[0];
          } else {
            const indiceAzar = Math.floor(Math.random() * restantes.length);
            nuevaPregunta = restantes.splice(indiceAzar, 1)[0];
          }
          
          setPreguntaActiva(nuevaPregunta);
          setPreguntasDisponibles(restantes);
          setRespuestaUsuario('');
          setEstadoRespuesta(null);
        } else {
           setPausaActiva(null);
           setPreguntaActiva(null);
           setEstadoRespuesta(null);
           playerRef.current.playVideo();
        }
      }, 4000);
    }
  }

  return (
    <div style={{ background: 'linear-gradient(135deg, #0A192F 0%, #000000 100%)', minHeight: '100vh', width: '100vw', boxSizing: 'border-box', padding: '2vw', display: 'flex', flexDirection: 'column', fontFamily: 'Arial, sans-serif', color: '#FFFFFF', margin: 0, position: 'relative' }}>
      
      {/* Tutorial Overlay Nativo */}
      {mostrarTutorial && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', backgroundColor: 'rgba(0,0,0,0.85)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 9999, padding: '20px', boxSizing: 'border-box' }}>
          <div style={{ backgroundColor: '#121212', padding: '40px', borderRadius: '15px', border: '2px solid #FF9800', boxShadow: '0 0 20px rgba(255,152,0,0.5)', maxWidth: '600px', width: '100%', textAlign: 'center' }}>
            <h2 style={{ color: '#FF9800', marginTop: 0 }}>Bienvenida a P&A Agent</h2>
            <ul style={{ textAlign: 'left', fontSize: '18px', lineHeight: '1.8', margin: '25px 0', color: '#FFF' }}>
              <li><strong>1.</strong> Pega el enlace de tu clase de YouTube en el buscador.</li>
              <li><strong>2.</strong> El agente analizará el video y lo pausará automáticamente en temas clave.</li>
              <li><strong>3.</strong> Si la pregunta lo requiere, aparecerá un <strong>Simulador Interactivo</strong>. Úsalo para encontrar la respuesta.</li>
            </ul>
            <button onClick={cerrarTutorial} style={{ backgroundColor: '#FF9800', color: '#000', padding: '15px 40px', border: 'none', borderRadius: '8px', fontSize: '18px', fontWeight: 'bold', cursor: 'pointer', boxShadow: '0 0 15px rgba(255,152,0,0.5)' }}>
              Comenzar a estudiar
            </button>
          </div>
        </div>
      )}

      <h1 style={{ color: '#FF9800', textShadow: '0 0 10px rgba(255, 152, 0, 0.8)', textAlign: 'center', margin: '0 0 15px 0' }}>
        P&A Agent
      </h1>
      
      <div style={{ backgroundColor: 'rgba(0,0,0,0.7)', padding: '15px', borderRadius: '15px', marginBottom: '20px', display: 'flex', flexWrap: 'wrap', gap: '15px', justifyContent: 'center', boxShadow: '0 0 15px rgba(255, 152, 0, 0.3)', border: '1px solid #FF7043', width: '100%', boxSizing: 'border-box' }}>
        <input type="text" placeholder="Pega el enlace de YouTube aquí..." value={url} onChange={(e) => setUrl(e.target.value)} style={{ flex: '1 1 300px', maxWidth: '800px', padding: '12px', backgroundColor: '#121212', color: '#FFF', border: '1px solid #FF9800', borderRadius: '8px', outline: 'none' }} />
        <button onClick={procesarVideo} disabled={cargando} style={{ padding: '12px 30px', cursor: 'pointer', backgroundColor: '#FF9800', color: '#000', border: 'none', borderRadius: '8px', fontWeight: 'bold', fontSize: '16px', boxShadow: '0 0 10px #FF9800', transition: '0.3s' }}>
          {cargando ? 'Analizando...' : 'Comenzar práctica'}
        </button>
      </div>

      {error && <div style={{ color: '#F44336', textAlign: 'center', marginBottom: '20px', textShadow: '0 0 5px red' }}><strong>Error:</strong> {error}</div>}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2vw', width: '100%', flex: 1, alignItems: 'stretch' }}>
        
        <div style={{ flex: '1.5 1 500px', backgroundColor: '#000', padding: '15px', borderRadius: '15px', boxShadow: '0 0 20px rgba(10, 25, 47, 0.8)', border: '1px solid #0A192F', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
          
          {!resultado ? (
            <h2 style={{ color: '#555' }}>Área de Reproducción Visual</h2>
          ) : (
            <>
              {preguntaActiva?.tipo === 'simulador' && (
                <h3 style={{ color: '#4CAF50', textAlign: 'center', marginTop: 0, textShadow: '0 0 5px #4CAF50' }}>Práctica de Laboratorio Activa</h3>
              )}
              <div style={{ position: 'relative', width: '100%', paddingTop: '56.25%', flex: 1 }}>
                <div style={{ display: preguntaActiva?.tipo === 'simulador' ? 'none' : 'block', position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }}>
                  <YouTube videoId={obtenerVideoId(url)} opts={{ width: '100%', height: '100%', playerVars: { autoplay: 1 } }} onReady={(e) => playerRef.current = e.target} style={{ width: '100%', height: '100%' }} />
                </div>
                {preguntaActiva?.tipo === 'simulador' && (
                  <iframe src={preguntaActiva.url_simulador} style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', border: 'none', borderRadius: '10px', backgroundColor: '#FFF' }} allowFullScreen></iframe>
                )}
              </div>
            </>
          )}

        </div>

        <div style={{ flex: '1 1 300px', backgroundColor: 'rgba(0,0,0,0.8)', padding: '25px', borderRadius: '15px', borderTop: '4px solid #FFC107', boxShadow: '0 0 15px rgba(255, 193, 7, 0.2)', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          
          {!resultado ? (
             <h2 style={{ color: '#555', textAlign: 'center' }}>Área de Evaluación</h2>
          ) : !pausaActiva ? (
            <div style={{ textAlign: 'center' }}>
              <h3 style={{ color: '#FFC107', textShadow: '0 0 10px rgba(255, 193, 7, 0.5)' }}>El video está en reproducción.<br/><br/>Atento a las preguntas.</h3>
            </div>
          ) : (
            <div style={{ overflowY: 'auto', maxHeight: '100%' }}>
              <h3 style={{ color: '#FFC107', marginTop: '0', textShadow: '0 0 8px rgba(255, 193, 7, 0.8)' }}>Pausa en el minuto: {pausaActiva.minuto_pausa}</h3>
              
              {preguntaActiva.tipo === 'simulador' && (
                <span style={{ backgroundColor: '#4CAF50', color: '#FFF', padding: '5px 10px', borderRadius: '5px', fontSize: '12px', fontWeight: 'bold' }}>TAREA PRÁCTICA</span>
              )}
              
              <p style={{ fontSize: '18px', lineHeight: '1.5', margin: '15px 0' }}>{preguntaActiva.pregunta}</p>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {(preguntaActiva.tipo === 'opcion_multiple' || preguntaActiva.tipo === 'verdadero_falso' || preguntaActiva.tipo === 'simulador') && (
                  preguntaActiva.opciones.map((opcion, index) => {
                    let colorBorde = '#FF9800';
                    let resplandor = 'none';
                    if (estadoRespuesta) {
                      const esLaCorrecta = opcion.charAt(0) === preguntaActiva.respuesta_correcta || opcion === preguntaActiva.respuesta_correcta;
                      const fueSeleccionada = respuestaUsuario === opcion;
                      if (esLaCorrecta) { colorBorde = '#4CAF50'; resplandor = '0 0 10px #4CAF50'; }
                      else if (fueSeleccionada) { colorBorde = '#F44336'; resplandor = '0 0 10px #F44336'; }
                    }
                    return (
                      <button key={index} onClick={() => !estadoRespuesta && validarRespuesta(opcion)} style={{ padding: '12px', textAlign: 'left', backgroundColor: '#121212', color: '#FFF', border: `2px solid ${colorBorde}`, borderRadius: '10px', boxShadow: resplandor, cursor: estadoRespuesta ? 'default' : 'pointer', fontSize: '16px' }}>
                        {opcion}
                      </button>
                    )
                  })
                )}

                {preguntaActiva.tipo === 'completar' && (
                  <input type="text" disabled={estadoRespuesta !== null} placeholder="Escribe tu respuesta..." onKeyDown={(e) => { if (e.key === 'Enter' && !estadoRespuesta) validarRespuesta(e.target.value) }} style={{ padding: '12px', backgroundColor: '#121212', color: '#FFF', border: `2px solid ${estadoRespuesta === 'correcta' ? '#4CAF50' : estadoRespuesta === 'incorrecta' ? '#F44336' : '#FF9800'}`, borderRadius: '10px', outline: 'none', fontSize: '16px', boxShadow: estadoRespuesta === 'correcta' ? '0 0 10px #4CAF50' : estadoRespuesta === 'incorrecta' ? '0 0 10px #F44336' : '0 0 10px rgba(255,152,0,0.3)' }} />
                )}
              </div>

              {estadoRespuesta && (
                <div style={{ marginTop: '20px', padding: '15px', backgroundColor: 'rgba(18,18,18,0.9)', borderRadius: '10px', borderLeft: `4px solid ${estadoRespuesta === 'correcta' ? '#4CAF50' : '#F44336'}`, boxShadow: `0 0 15px ${estadoRespuesta === 'correcta' ? 'rgba(76, 175, 80, 0.3)' : 'rgba(244, 67, 54, 0.3)'}` }}>
                  <p style={{ margin: 0, fontSize: '16px' }}><strong>{estadoRespuesta === 'correcta' ? '¡Excelente! ' : 'Incorrecto. '}</strong> {preguntaActiva.retroalimentacion}</p>
                  <p style={{ margin: '10px 0 0 0', color: '#FFC107', fontSize: '14px' }}>{estadoRespuesta === 'correcta' ? 'Reanudando video...' : 'Generando nueva pregunta...'}</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default App