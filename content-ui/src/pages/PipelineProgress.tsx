import React, { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { getMockStatus } from '../mock/mockServer'
import { StatusResponse, AgentName } from '../types'

// ─── Galaxy Canvas Background ─────────────────────────────────────────────────
function Galaxy() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const mouseRef = useRef({ x: -9999, y: -9999 })

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let t = 0
    let animId: number

    interface Star { x: number; y: number; vx: number; vy: number; r: number; phase: number; speed: number; cr: number; cg: number; cb: number }

    const resize = () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight }
    resize()
    window.addEventListener('resize', resize)
    const onMove = (e: MouseEvent) => { mouseRef.current = { x: e.clientX, y: e.clientY } }
    window.addEventListener('mousemove', onMove)

    const palettes = [[59,130,246],[99,102,241],[139,92,246],[6,182,212],[168,85,247],[220,228,255]]
    const stars: Star[] = Array.from({ length: 260 }, () => {
      const p = palettes[Math.floor(Math.random() * palettes.length)]
      return { x: Math.random() * window.innerWidth, y: Math.random() * window.innerHeight, vx: (Math.random()-0.5)*0.06, vy: (Math.random()-0.5)*0.06, r: Math.random()*1.6+0.2, phase: Math.random()*Math.PI*2, speed: 0.6+Math.random()*2, cr: p[0], cg: p[1], cb: p[2] }
    })

    const draw = () => {
      const w = canvas.width; const h = canvas.height
      ctx.fillStyle = 'rgba(6,8,15,0.18)'; ctx.fillRect(0,0,w,h)
      const mx = mouseRef.current.x; const my = mouseRef.current.y

      stars.forEach(s => {
        const dx = s.x-mx; const dy = s.y-my; const dist = Math.sqrt(dx*dx+dy*dy)
        if (dist < 140 && dist > 0) { const f=((140-dist)/140)*0.25; s.vx+=(dx/dist)*f; s.vy+=(dy/dist)*f }
        s.vx*=0.97; s.vy*=0.97; s.x+=s.vx; s.y+=s.vy
        if (s.x < -10) s.x=w+10; if (s.x > w+10) s.x=-10; if (s.y < -10) s.y=h+10; if (s.y > h+10) s.y=-10
        const bri = 0.25+0.75*Math.abs(Math.sin(t*s.speed+s.phase)); const r=s.r*(0.7+0.5*bri)
        ctx.beginPath(); ctx.arc(s.x,s.y,r,0,Math.PI*2); ctx.fillStyle=`rgba(${s.cr},${s.cg},${s.cb},${bri*0.9})`; ctx.fill()
        if (bri > 0.65) { const g=ctx.createRadialGradient(s.x,s.y,0,s.x,s.y,r*5); g.addColorStop(0,`rgba(${s.cr},${s.cg},${s.cb},${bri*0.25})`); g.addColorStop(1,`rgba(${s.cr},${s.cg},${s.cb},0)`); ctx.fillStyle=g; ctx.beginPath(); ctx.arc(s.x,s.y,r*5,0,Math.PI*2); ctx.fill() }
      })

      const nebulae=[{x:0.15,y:0.3,r:0.28,cr:59,cg:130,cb:246},{x:0.85,y:0.7,r:0.24,cr:139,cg:92,cb:246},{x:0.5,y:0.15,r:0.2,cr:6,cg:182,cb:212}]
      nebulae.forEach(n => { const nx=w*n.x+Math.sin(t*0.08+n.x*3)*w*0.04; const ny=h*n.y+Math.cos(t*0.06+n.y*3)*h*0.04; const nr=Math.min(w,h)*n.r; const ng=ctx.createRadialGradient(nx,ny,0,nx,ny,nr); ng.addColorStop(0,`rgba(${n.cr},${n.cg},${n.cb},0.025)`); ng.addColorStop(1,`rgba(${n.cr},${n.cg},${n.cb},0)`); ctx.fillStyle=ng; ctx.fillRect(0,0,w,h) })

      t+=0.016; animId=requestAnimationFrame(draw)
    }

    ctx.fillStyle='#06080f'; ctx.fillRect(0,0,canvas.width,canvas.height); draw()
    return () => { cancelAnimationFrame(animId); window.removeEventListener('resize',resize); window.removeEventListener('mousemove',onMove) }
  }, [])

  return <canvas ref={canvasRef} style={{ position:'fixed',inset:0,zIndex:0,pointerEvents:'none' }} />
}

// ─── Pipeline Logic ───────────────────────────────────────────────────────────
const AGENTS: { key: AgentName; label: string; description: string; icon: string }[] = [
  { key:'profile_loader', label:'Profile Loader',   description:'Loading company brand profile',   icon:'◈' },
  { key:'drafter',        label:'Content Drafter',  description:'Generating content draft',         icon:'✦' },
  { key:'brand_checker',  label:'Brand Compliance', description:'Checking brand guidelines',        icon:'⬡' },
  { key:'legal_reviewer', label:'Legal Review',     description:'Checking regulatory compliance',   icon:'⚖' },
  { key:'seo_checker',    label:'SEO Check',        description:'Analysing discoverability',        icon:'◎' },
  { key:'human_gate',     label:'Human Approval',   description:'Awaiting your review',             icon:'◉' },
  { key:'localizer',      label:'Localisation',     description:'Translating to target languages',  icon:'◆' },
  { key:'distributor',    label:'Distribution',     description:'Publishing to channels',           icon:'▶' },
]
type CardState = 'pending'|'active'|'passed'|'failed'|'waiting'
interface LogEntry { id:number; time:string; msg:string; type:'info'|'success'|'warn'|'error'|'system' }

function getCardState(key: AgentName, s: StatusResponse): CardState {
  const cur=s.current_node
  if (key==='brand_checker') { if (cur==='brand_checker') return s.brand_passed===false&&s.brand_score!==null?'failed':'active'; if (s.brand_passed) return 'passed' }
  if (key==='legal_reviewer') { if (cur==='legal_reviewer') return 'active'; if (s.legal_passed) return 'passed' }
  if (key==='human_gate') { if (s.status==='awaiting_human') return 'waiting'; if (s.pipeline_complete) return 'passed' }
  if (cur===key) return 'active'
  const order=AGENTS.map(a=>a.key); const ci=order.indexOf(cur as AgentName); const ai=order.indexOf(key)
  if (s.pipeline_complete) return 'passed'; if (ci>ai) return 'passed'; return 'pending'
}

const CFG: Record<CardState,{bg:string;border:string;dot:string;label:string;glow:string;text:string}> = {
  active:  {bg:'rgba(59,130,246,0.11)', border:'#3b82f6',dot:'#3b82f6',label:'#93c5fd',glow:'0 0 24px rgba(59,130,246,0.3)',text:'Running…'},
  passed:  {bg:'rgba(34,197,94,0.07)',  border:'#22c55e',dot:'#22c55e',label:'#86efac',glow:'0 0 16px rgba(34,197,94,0.18)',text:'Passed ✓'},
  failed:  {bg:'rgba(239,68,68,0.09)',  border:'#ef4444',dot:'#ef4444',label:'#fca5a5',glow:'0 0 20px rgba(239,68,68,0.22)',text:'Needs revision'},
  waiting: {bg:'rgba(245,158,11,0.09)', border:'#f59e0b',dot:'#f59e0b',label:'#fcd34d',glow:'0 0 20px rgba(245,158,11,0.22)',text:'Awaiting you'},
  pending: {bg:'rgba(12,14,24,0.55)',   border:'#1a1f30',dot:'#1a1f30',label:'#2a3050',glow:'none',text:'Pending'},
}

const LC: Record<LogEntry['type'],{c:string;bar:string;bg:string}> = {
  info:    {c:'#60a5fa',bar:'#3b82f6',bg:'rgba(59,130,246,0.06)'},
  success: {c:'#4ade80',bar:'#22c55e',bg:'rgba(34,197,94,0.06)'},
  warn:    {c:'#fbbf24',bar:'#f59e0b',bg:'rgba(245,158,11,0.06)'},
  error:   {c:'#f87171',bar:'#ef4444',bg:'rgba(239,68,68,0.06)'},
  system:  {c:'#a78bfa',bar:'#8b5cf6',bg:'rgba(139,92,246,0.06)'},
}

function classify(m: string): LogEntry['type'] {
  if (m.includes('complete')||m.includes('passed')||m.includes('published')) return 'success'
  if (m.includes('violation')||m.includes('FAIL')||m.includes('error')) return 'error'
  if (m.includes('flag')||m.includes('revision')||m.includes('Revision')) return 'warn'
  if (m.includes('paused')||m.includes('human')) return 'system'
  return 'info'
}

function PulseDot({color}:{color:string}) {
  return (
    <div style={{position:'relative',width:10,height:10,flexShrink:0}}>
      <div style={{position:'absolute',inset:0,borderRadius:'50%',backgroundColor:color,opacity:0.35,animation:'ppPing 1.4s cubic-bezier(0,0,0.2,1) infinite'}}/>
      <div style={{position:'absolute',inset:0,borderRadius:'50%',backgroundColor:color}}/>
    </div>
  )
}

export default function PipelineProgress() {
  const navigate = useNavigate()
  const { runId, companyName } = useApp()
  const [status, setStatus] = useState<StatusResponse | null>(null)
  const [logs, setLogs] = useState<LogEntry[]>([])
  const logCounter = useRef(0)

  const passedCount = status ? AGENTS.filter(a => getCardState(a.key, status) === 'passed').length : 0
  const progress = Math.round((passedCount / AGENTS.length) * 100)

  useEffect(() => {
    const rid = runId || 'mock_demo_run'
    const add = (msg: string) => {
      const type = classify(msg)
      setLogs(prev => [{ id: logCounter.current++, time: new Date().toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit',second:'2-digit'}), msg, type }, ...prev].slice(0, 60))
    }
    const poll = () => {
      const s = getMockStatus(rid); setStatus(s)
      if (s.current_node) add(`Agent ${s.current_node} — ${s.status}`)
      if (s.revision_count>0&&s.current_node==='drafter') add(`Revision ${s.revision_count} triggered — fixing brand violations`)
      if (s.brand_passed&&s.current_node==='brand_checker') add(`Brand score: ${s.brand_score}/100 — passed`)
      if (s.status==='awaiting_human') add('Pipeline paused — human review required')
      if (s.status==='complete') add('Pipeline complete — content published')
      if (s.status==='awaiting_human'||s.status==='complete'||s.status==='error') clearInterval(id)
    }
    poll(); const id = setInterval(poll, 2000); return () => clearInterval(id)
  }, [runId])

  useEffect(() => { if (status?.status==='awaiting_human') setTimeout(()=>navigate('/approve'),1500) }, [status?.status, navigate])

  const revisionActive = status?.current_node==='drafter'&&(status?.revision_count??0)>0

  return (
    <>
      <Galaxy />
      <style>{`
        @keyframes ppPing { 75%,100%{transform:scale(2.5);opacity:0;} }
        @keyframes ppSlide { from{opacity:0;transform:translateY(-5px);}to{opacity:1;transform:translateY(0);} }
        .pp-log{animation:ppSlide 0.22s ease forwards;}
        .pp-card{transition:box-shadow 0.3s,border-color 0.3s;}
      `}</style>

      <div style={{position:'relative',zIndex:1,maxWidth:1100,margin:'0 auto',paddingBottom:40}}>
        {/* Header */}
        <div style={{marginBottom:28,display:'flex',alignItems:'flex-start',justifyContent:'space-between',flexWrap:'wrap',gap:16}}>
          <div>
            <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:6}}>
              <div style={{width:8,height:8,borderRadius:'50%',background:'#3b82f6',boxShadow:'0 0 12px #3b82f6',animation:status?.pipeline_complete?'none':'ppPing 1.5s ease infinite'}}/>
              <h1 style={{color:'#f0f4ff',fontSize:26,fontWeight:700,margin:0,letterSpacing:'-0.02em'}}>Pipeline Running</h1>
            </div>
            <p style={{color:'#3a4560',fontSize:14,margin:0}}>
              {companyName?<>Processing for <span style={{color:'#3b82f6',fontWeight:600}}>{companyName}</span></>:'Processing content through the agent pipeline…'}
            </p>
          </div>
          <div style={{background:'rgba(10,12,22,0.75)',backdropFilter:'blur(12px)',border:'1px solid #1a1f30',borderRadius:50,padding:'10px 20px',display:'flex',alignItems:'center',gap:12}}>
            <div style={{position:'relative',width:38,height:38}}>
              <svg width="38" height="38" style={{transform:'rotate(-90deg)'}}>
                <circle cx="19" cy="19" r="15" fill="none" stroke="#1a1f30" strokeWidth="3"/>
                <circle cx="19" cy="19" r="15" fill="none" stroke="#3b82f6" strokeWidth="3" strokeDasharray={`${2*Math.PI*15}`} strokeDashoffset={`${2*Math.PI*15*(1-progress/100)}`} strokeLinecap="round" style={{transition:'stroke-dashoffset 0.6s ease'}}/>
              </svg>
              <div style={{position:'absolute',inset:0,display:'flex',alignItems:'center',justifyContent:'center',fontSize:9,fontWeight:700,color:'#93c5fd'}}>{progress}%</div>
            </div>
            <div>
              <div style={{color:'#e2e8f0',fontSize:13,fontWeight:600}}>{passedCount}/{AGENTS.length} agents</div>
              <div style={{color:'#3a4560',fontSize:11}}>{status?.pipeline_complete?'Complete':status?.status==='awaiting_human'?'Awaiting approval':'In progress'}</div>
            </div>
          </div>
        </div>

        {/* Progress bar */}
        <div style={{height:2,background:'#1a1f30',borderRadius:2,marginBottom:24,overflow:'hidden'}}>
          <div style={{height:'100%',width:`${progress}%`,background:'linear-gradient(90deg,#3b82f6,#8b5cf6)',transition:'width 0.6s ease',boxShadow:'0 0 10px rgba(59,130,246,0.7)'}}/>
        </div>

        <div style={{display:'grid',gridTemplateColumns:'1fr 295px',gap:16,alignItems:'start'}}>
          {/* Agent cards */}
          <div style={{display:'flex',flexDirection:'column',gap:7}}>
            {AGENTS.map((agent,idx)=>{
              const state=status?getCardState(agent.key,status):'pending'; const cfg=CFG[state]
              const isBrandFailed=agent.key==='brand_checker'&&state==='failed'
              return (
                <React.Fragment key={agent.key}>
                  <div className="pp-card" style={{background:cfg.bg,border:`1px solid ${cfg.border}`,borderRadius:11,padding:'12px 16px',display:'flex',alignItems:'center',gap:12,boxShadow:state==='active'||state==='waiting'?cfg.glow:'none',backdropFilter:'blur(8px)'}}>
                    <div style={{width:24,height:24,borderRadius:'50%',flexShrink:0,display:'flex',alignItems:'center',justifyContent:'center',fontSize:10,fontWeight:700,background:state==='pending'?'#0a0d18':`${cfg.border}20`,border:`1px solid ${state==='pending'?'#1a1f30':cfg.border}`,color:state==='pending'?'#1e2538':cfg.label}}>
                      {state==='passed'?'✓':idx+1}
                    </div>
                    {state==='active'||state==='waiting'?<PulseDot color={cfg.dot}/>:<div style={{width:7,height:7,borderRadius:'50%',background:cfg.dot,flexShrink:0}}/>}
                    <span style={{fontSize:14,color:cfg.label,flexShrink:0,opacity:state==='pending'?0.15:1}}>{agent.icon}</span>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{color:state==='pending'?'#2a3050':'#e2e8f0',fontSize:13,fontWeight:600}}>{agent.label}</div>
                      <div style={{color:'#2a3050',fontSize:11,marginTop:1}}>{agent.description}</div>
                    </div>
                    <div style={{display:'flex',gap:6,alignItems:'center',flexShrink:0}}>
                      {agent.key==='brand_checker'&&status?.brand_score!=null&&<span style={{background:(status.brand_score>=80)?'rgba(34,197,94,0.15)':'rgba(239,68,68,0.15)',color:(status.brand_score>=80)?'#86efac':'#fca5a5',border:`1px solid ${(status.brand_score>=80)?'#22c55e30':'#ef444430'}`,borderRadius:6,padding:'2px 8px',fontSize:11,fontWeight:700}}>{status.brand_score}/100</span>}
                      {agent.key==='legal_reviewer'&&(status?.legal_flags_count??0)>0&&<span style={{background:'rgba(245,158,11,0.15)',color:'#fcd34d',border:'1px solid rgba(245,158,11,0.3)',borderRadius:6,padding:'2px 8px',fontSize:11,fontWeight:700}}>{status?.legal_flags_count} flag{(status?.legal_flags_count??0)>1?'s':''}</span>}
                      {agent.key==='drafter'&&(status?.revision_count??0)>0&&<span style={{background:'rgba(59,130,246,0.15)',color:'#93c5fd',border:'1px solid rgba(59,130,246,0.3)',borderRadius:6,padding:'2px 8px',fontSize:11,fontWeight:700}}>Rev {status?.revision_count}</span>}
                      <span style={{color:cfg.label,fontSize:11,fontWeight:500,minWidth:78,textAlign:'right'}}>{cfg.text}</span>
                    </div>
                  </div>
                  {isBrandFailed&&revisionActive&&<div style={{display:'flex',alignItems:'center',gap:8,padding:'5px 14px',background:'rgba(239,68,68,0.05)',border:'1px dashed rgba(239,68,68,0.3)',borderRadius:7,fontSize:11,color:'#fca5a5',marginLeft:18}}>↺ Brand violation — routing back to Content Drafter for revision</div>}
                </React.Fragment>
              )
            })}
            {status?.pipeline_complete&&<div style={{background:'rgba(34,197,94,0.07)',border:'1px solid rgba(34,197,94,0.35)',borderRadius:12,padding:'18px 20px',textAlign:'center',boxShadow:'0 0 30px rgba(34,197,94,0.1)',backdropFilter:'blur(8px)'}}>
              <div style={{color:'#4ade80',fontSize:24,marginBottom:4}}>✓</div>
              <div style={{color:'#86efac',fontSize:14,fontWeight:600}}>Content published successfully</div>
              <div style={{color:'#2a3050',fontSize:12,marginTop:4}}>All agents completed</div>
            </div>}
          </div>

          {/* Live log */}
          <div style={{background:'rgba(6,8,15,0.88)',backdropFilter:'blur(16px)',border:'1px solid #1a1f30',borderRadius:12,overflow:'hidden',position:'sticky',top:24,maxHeight:510,display:'flex',flexDirection:'column'}}>
            <div style={{padding:'9px 13px',borderBottom:'1px solid #1a1f30',display:'flex',alignItems:'center',justifyContent:'space-between',background:'rgba(20,24,40,0.6)',flexShrink:0}}>
              <div style={{display:'flex',alignItems:'center',gap:7}}>
                <div style={{width:6,height:6,borderRadius:'50%',background:'#22c55e',boxShadow:'0 0 6px #22c55e',animation:status?.pipeline_complete?'none':'ppPing 1.5s ease infinite'}}/>
                <span style={{color:'#3a4560',fontSize:10,fontWeight:700,letterSpacing:'0.1em'}}>LIVE LOG</span>
              </div>
              <span style={{color:'#1a1f30',fontSize:9,fontFamily:'monospace'}}>{logs.length} entries</span>
            </div>
            <div style={{flex:1,overflowY:'auto',padding:'6px 0',display:'flex',flexDirection:'column',gap:1}}>
              {logs.length===0&&<div style={{color:'#1a1f30',fontSize:11,fontFamily:'monospace',padding:'8px 13px'}}>Waiting for pipeline…</div>}
              {logs.map((entry,i)=>{
                const lc=LC[entry.type]
                return <div key={entry.id} className="pp-log" style={{display:'flex',gap:7,alignItems:'flex-start',padding:'4px 13px',background:i===0?lc.bg:'transparent',borderLeft:`2px solid ${i===0?lc.bar:'transparent'}`}}>
                  <span style={{color:'#1e2538',fontSize:9,fontFamily:'monospace',flexShrink:0,marginTop:1,minWidth:52}}>{entry.time}</span>
                  <span style={{color:i===0?lc.c:'#2a3050',fontSize:10,fontFamily:'monospace',lineHeight:1.5,wordBreak:'break-word'}}>{entry.msg}</span>
                </div>
              })}
            </div>
            {status?.draft_preview&&<div style={{borderTop:'1px solid #1a1f30',padding:'9px 13px',background:'rgba(139,92,246,0.04)',flexShrink:0}}>
              <div style={{color:'#3a2a60',fontSize:9,fontWeight:700,letterSpacing:'0.1em',marginBottom:5}}>DRAFT PREVIEW</div>
              <div style={{color:'#3a2a60',fontSize:10,fontStyle:'italic',lineHeight:1.6,fontFamily:'monospace'}}>{status.draft_preview.slice(0,150)}{status.draft_preview.length>150?'…':''}</div>
            </div>}
          </div>
        </div>
      </div>
    </>
  )
}