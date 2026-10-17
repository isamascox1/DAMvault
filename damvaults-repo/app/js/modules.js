// ══════════════════════════════════════════════════════════════════
//  DAMvault — PARTE 2: Módulos restantes
//  INSTRUCCIONES: Pega este código ANTES del cierre </script> en
//  DAMvault_Parte1.html, reemplazando las 8 funciones placeholder:
//  rTeam, rAnalytics, animCharts, rSec, rPlans, rColl, rShared,
//  rAPI, rTrash
// ══════════════════════════════════════════════════════════════════

// TEAM
function rTeam(){
  const users=DB.get('users')||[];
  const rc={admin:'background:var(--rdim);color:var(--red)',editor:'background:var(--adim);color:var(--accent2)',viewer:'background:var(--gdim);color:var(--green)',guest:'background:var(--surface2);color:var(--text3)'};
  return`<style>
  .ttbl{background:var(--bg2);border:1px solid var(--border);border-radius:var(--rl);overflow:hidden;margin-bottom:20px}
  .tth,.ttr{padding:10px 14px;display:grid;grid-template-columns:2fr 1.5fr 90px 70px 110px 100px;gap:10px;align-items:center}
  .tth{border-bottom:1px solid var(--border);font-size:10px;font-weight:600;color:var(--text3);text-transform:uppercase;letter-spacing:.6px}
  .ttr{border-bottom:1px solid var(--border);font-size:12px;transition:background .15s;cursor:pointer}
  .ttr:last-child{border-bottom:none}.ttr:hover{background:var(--surface)}
  .ptbl{width:100%;border-collapse:collapse;font-size:12px}
  .ptbl th{padding:8px 10px;font-size:10px;font-weight:600;color:var(--text3);text-transform:uppercase;text-align:center;border-bottom:1px solid var(--border)}
  .ptbl th:first-child{text-align:left}
  .ptbl td{padding:8px 10px;border-bottom:1px solid var(--border);text-align:center;color:var(--text3)}
  .ptbl td:first-child{text-align:left;color:var(--text2)}.ptbl tr:last-child td{border-bottom:none}
  @media(max-width:700px){.tth,.ttr{grid-template-columns:1.5fr 90px 100px}.tth>*:nth-child(n+3):not(:nth-child(3)):not(:nth-child(6)),.ttr>*:nth-child(n+3):not(:nth-child(3)):not(:nth-child(6)){display:none}}
  </style>
  <div class="ph"><div><div class="pt">Gestión de equipo</div><div class="ps">${users.length} miembros en tu organización</div></div>
  <div class="pa"><button class="btn btn-g" onclick="openMo('moInvite')">📧 Invitar</button><button class="btn btn-p" onclick="openMo('moInvite')">+ Agregar</button></div></div>
  <div class="ttbl">
    <div class="tth"><div>Usuario</div><div>Correo</div><div>Rol</div><div>Assets</div><div>Almacenamiento</div><div>Acciones</div></div>
    ${users.map(u=>`<div class="ttr">
      <div style="display:flex;align-items:center;gap:9px">
        <div class="av av-sm" style="background:linear-gradient(135deg,${u.ac})">${(u.first[0]+u.last[0]).toUpperCase()}</div>
        <div><div style="font-size:12px;font-weight:500">${u.first} ${u.last}</div><div style="font-size:10px;color:var(--text3)">${u.ll==='—'?'Pendiente':new Date(u.ll).toLocaleDateString('es')}</div></div>
      </div>
      <div style="font-size:11px;color:var(--text2);font-family:'JetBrains Mono',monospace;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${u.email}</div>
      <div><span style="font-size:10px;padding:3px 9px;border-radius:20px;font-weight:500;${rc[u.role]||rc.guest}">${u.role.charAt(0).toUpperCase()+u.role.slice(1)}</span></div>
      <div style="font-size:12px;font-weight:500">${Math.floor(Math.random()*80+10)}</div>
      <div><div style="font-size:10px;color:var(--text3);margin-bottom:3px">${u.su||0}/${u.sm||5}GB</div><div style="height:4px;background:var(--border);border-radius:2px;width:80px;overflow:hidden"><div style="height:100%;background:var(--accent);border-radius:2px;width:${Math.round(((u.su||0)/(u.sm||5))*100)}%"></div></div></div>
      <div style="display:flex;gap:5px">
        <button class="btn btn-g" style="font-size:11px;padding:4px 9px" onclick="chgRole('${u.id}')">✏ Rol</button>
        ${u.id!==CU?.id?`<button class="btn btn-d" style="font-size:11px;padding:4px 9px" onclick="rmUser('${u.id}')">✕</button>`:'<span style="font-size:10px;color:var(--text3);padding:4px">Tú</span>'}
      </div>
    </div>`).join('')}
  </div>
  <div class="card" style="margin-bottom:20px"><div style="font-size:13px;font-weight:600;margin-bottom:14px">🔑 Permisos por rol</div>
    <div style="overflow-x:auto"><table class="ptbl"><thead><tr><th>Permiso</th><th style="color:var(--red)">Admin</th><th style="color:var(--accent2)">Editor</th><th style="color:var(--green)">Viewer</th><th style="color:var(--text3)">Guest</th></tr></thead><tbody>
      ${[['Ver imágenes','✅','✅','✅','✅'],['Subir archivos','✅','✅','❌','❌'],['Editar metadata','✅','✅','❌','❌'],['Eliminar archivos','✅','❌','❌','❌'],['Compartir enlaces','✅','✅','❌','❌'],['Gestionar equipo','✅','❌','❌','❌'],['Ver analytics','✅','✅','❌','❌'],['Gestionar API','✅','❌','❌','❌'],['Config. seguridad','✅','❌','❌','❌'],['Papelera','✅','✅','❌','❌']].map(([p,...v])=>`<tr><td>${p}</td>${v.map(x=>`<td>${x}</td>`).join('')}</tr>`).join('')}
    </tbody></table></div>
  </div>
  <div class="card"><div style="font-size:13px;font-weight:600;margin-bottom:12px">📋 Actividad del equipo</div>
    ${[['📤','var(--accent)','Carlos subió 5 imágenes','Productos','Hace 5 min'],['👁','var(--green)','Ana revisó galería','Marketing','Hace 20 min'],['🔗','var(--amber)','María compartió enlace','hero-banner','Hace 1h'],['⬇','var(--purple)','Diego descargó 3 archivos','Logo pack','Hace 2h']].map(([ic,col,t,d,time])=>`
    <div style="display:flex;gap:10px;padding:9px;border-radius:var(--r);cursor:pointer;transition:background .15s" onmouseover="this.style.background='var(--surface)'" onmouseout="this.style.background='transparent'">
      <div style="width:28px;height:28px;border-radius:7px;background:${col}22;color:${col};display:flex;align-items:center;justify-content:center;font-size:13px;flex-shrink:0">${ic}</div>
      <div style="flex:1"><div style="font-size:12px;font-weight:500">${t}</div><div style="font-size:10px;color:var(--text3)">${d}</div></div>
      <div style="font-size:10px;color:var(--text3)">${time}</div>
    </div>`).join('')}
  </div>`;
}
function chgRole(uid){const users=DB.get('users')||[];const u=users.find(x=>x.id===uid);if(!u)return;const roles=['admin','editor','viewer','guest'];u.role=roles[(roles.indexOf(u.role)+1)%roles.length];DB.set('users',users);toast('✅ '+u.first+' → '+u.role);nav('team');}
function rmUser(uid){const users=DB.get('users')||[];const u=users.find(x=>x.id===uid);if(!u||!confirm('¿Eliminar a '+u.first+'?'))return;DB.set('users',users.filter(x=>x.id!==uid));toast('🗑 '+u.first+' eliminado');nav('team');}

// ANALYTICS
function rAnalytics(){
  const users=DB.get('users')||[];
  return`<style>
  .brow{display:flex;align-items:center;gap:10px}.blbl{width:90px;font-size:11px;color:var(--text2);text-align:right;flex-shrink:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .bbg{flex:1;height:22px;background:var(--surface);border-radius:4px;overflow:hidden}.bfill{height:100%;border-radius:4px;transition:width 1.3s cubic-bezier(.4,0,.2,1);display:flex;align-items:center;justify-content:flex-end;padding-right:7px}
  .bval{font-size:10px;font-weight:600;color:#fff;font-family:'JetBrains Mono',monospace}
  </style>
  <div class="ph"><div><div class="pt">Analytics & Reportes</div><div class="ps">Métricas en tiempo real</div></div>
  <div class="pa"><select class="ssort"><option>30 días</option><option>7 días</option><option>Este mes</option></select><button class="btn btn-g" onclick="toast('📄 PDF...')">⬇ PDF</button><button class="btn btn-g" onclick="toast('📊 CSV...')">⬇ CSV</button></div></div>
  <div class="sg" style="margin-bottom:22px">
    ${[['📥','var(--accent)','1,248','Descargas','↑ +23%'],['👁','var(--green)','8,430','Vistas','↑ +18%'],['🔗','var(--amber)','342','Clics enlaces','↓ -5%'],['📤','var(--purple)','89','Subidas','↑ +31%'],['👥','var(--cyan)',users.length,'Usuarios','Estable'],['💾','var(--pink)','3.7 GB','Storage','74%']].map(([ic,col,val,lbl,chg])=>`
    <div class="sc"><div class="si" style="background:${col}22;font-size:16px">${ic}</div><div class="sv" style="color:${col};font-size:22px">${val}</div><div class="sl">${lbl}</div><div class="sch" style="color:${chg.includes('↑')?'var(--green)':chg.includes('↓')?'var(--red)':'var(--text3)'}">${chg}</div></div>`).join('')}
  </div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:18px">
    <div class="card"><div style="font-size:13px;font-weight:600;margin-bottom:4px">Más descargadas</div><div style="font-size:11px;color:var(--text3);margin-bottom:14px">Este mes</div>
      <div style="display:flex;flex-direction:column;gap:10px">
        ${[['hero-banner',92,'var(--accent)'],['producto-laptop',78,'var(--green)'],['campaña-verano',65,'var(--purple)'],['logo-variantes',54,'var(--cyan)'],['equipo-directivo',41,'var(--amber)']].map(([n,v,c])=>`<div class="brow"><div class="blbl">${n}</div><div class="bbg"><div class="bfill" data-v="${v}" style="width:0%;background:${c}"><span class="bval">${v}</span></div></div></div>`).join('')}
      </div>
    </div>
    <div class="card"><div style="font-size:13px;font-weight:600;margin-bottom:4px">Uso por carpeta</div><div style="font-size:11px;color:var(--text3);margin-bottom:14px">Distribución</div>
      <div style="display:flex;flex-direction:column;gap:10px">
        ${[['Marketing',45,'var(--accent)'],['Productos',23,'var(--green)'],['Branding',15,'var(--purple)'],['RRHH',10,'var(--amber)'],['Reportes',7,'var(--red)']].map(([n,v,c])=>`<div class="brow"><div class="blbl">${n}</div><div class="bbg"><div class="bfill" data-v="${v}" style="width:0%;background:${c}"><span class="bval">${v}%</span></div></div></div>`).join('')}
      </div>
    </div>
  </div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
    <div class="card"><div style="font-size:13px;font-weight:600;margin-bottom:14px">Actividad reciente</div>
      ${[['📤','var(--accent)','Carlos subió 5 imgs','Productos','5 min'],['👁','var(--green)','Ana revisó galería','Marketing','20 min'],['🔗','var(--amber)','María compartió enlace','hero-banner','1h'],['⬇','var(--purple)','Diego descargó 3 arch.','Logo pack','2h']].map(([ic,col,t,d,time])=>`
      <div style="display:flex;gap:10px;padding:8px;border-radius:var(--r);cursor:pointer;transition:background .15s" onmouseover="this.style.background='var(--surface)'" onmouseout="this.style.background='transparent'">
        <div style="width:28px;height:28px;border-radius:7px;background:${col}22;color:${col};display:flex;align-items:center;justify-content:center;font-size:13px;flex-shrink:0">${ic}</div>
        <div style="flex:1"><div style="font-size:12px;font-weight:500">${t}</div><div style="font-size:10px;color:var(--text3)">${d}</div></div>
        <div style="font-size:10px;color:var(--text3)">${time}</div>
      </div>`).join('')}
    </div>
    <div class="card"><div style="font-size:13px;font-weight:600;margin-bottom:14px">Rendimiento</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        ${[['⚡','99.9%','Uptime','var(--green)'],['🚀','<80ms','Resp. API','var(--accent)'],['📦','38%','Compr. WebP','var(--purple)'],['🛡','0','Incidentes','var(--green)'],['🔗','87%','CDN rate','var(--cyan)'],['📋','4.9/5','Satisfacción','var(--amber)']].map(([ic,val,lbl,col])=>`<div style="background:var(--surface);border-radius:var(--r);padding:12px;text-align:center"><div style="font-size:18px;margin-bottom:4px">${ic}</div><div style="font-family:'Syne',sans-serif;font-size:16px;font-weight:700;color:${col};margin-bottom:2px">${val}</div><div style="font-size:10px;color:var(--text3)">${lbl}</div></div>`).join('')}
      </div>
    </div>
  </div>`;
}
function animCharts(){setTimeout(()=>{document.querySelectorAll('.bfill').forEach(b=>b.style.width=(b.dataset.v||0)+'%');},150);}

// SECURITY
function rSec(){
  const opts=DB.get('secopts')||{tfa:true,jwt:true,rl:true,aes:true,log:true,av:true,cors:true,auto:false,wl:false,single:false};
  const log=DB.get('seclog')||[];
  const active=Object.values(opts).filter(Boolean).length,total=Object.keys(opts).length;
  const score=Math.round((active/total)*100);
  const items=[['🔐','tfa','2FA','TOTP / SMS / FIDO2','var(--green)'],['🎫','jwt','Tokens JWT','Exp: 24h · Refresh: 7d','var(--accent)'],['🚫','rl','Rate Limiting','100 req/min · 5 fallos=ban','var(--accent)'],['🔒','aes','AES-256','Reposo y TLS 1.3 tránsito','var(--green)'],['📋','log','Audit Logs','Todos los accesos 90 días','var(--accent)'],['🦠','av','Antivirus','Scan en tiempo real','var(--green)'],['🌐','cors','CORS','Solo dominios autorizados','var(--accent)'],['⏱','auto','Auto-logout','Inactividad 30 min','var(--amber)'],['📍','wl','IP Whitelist','Solo IPs aprobadas','var(--purple)'],['🔂','single','Sesión única','Un dispositivo activo','var(--cyan)']];
  return`<style>
  .scard{background:var(--surface);border:1px solid var(--border);border-radius:var(--r);padding:13px 14px;display:flex;align-items:center;gap:12px;margin-bottom:8px;transition:border .15s}
  .scard:hover{border-color:var(--border3)}.sic{width:38px;height:38px;border-radius:9px;display:flex;align-items:center;justify-content:center;font-size:17px;flex-shrink:0;transition:all .2s}
  .sw{width:40px;height:22px;background:var(--surface2);border-radius:11px;position:relative;cursor:pointer;transition:background .2s;flex-shrink:0;border:1px solid var(--border2)}
  .sw.on{background:var(--accent);border-color:var(--accent)}.sk{position:absolute;width:16px;height:16px;background:#fff;border-radius:50%;top:2px;left:2px;transition:left .2s;box-shadow:0 1px 3px rgba(0,0,0,.4)}.sw.on .sk{left:20px}
  </style>
  <div class="ph"><div><div class="pt">Seguridad & Privacidad</div><div class="ps">Estado del sistema</div></div><div class="pa"><button class="btn btn-g" onclick="toast('📋 Descargando...')">⬇ Reporte</button></div></div>
  <div style="background:linear-gradient(135deg,var(--adim),var(--gdim));border:1px solid rgba(91,124,246,.2);border-radius:var(--rl);padding:20px;display:flex;align-items:center;gap:18px;margin-bottom:18px;flex-wrap:wrap">
    <div style="width:70px;height:70px;flex-shrink:0;position:relative">
      <svg viewBox="0 0 70 70" width="70" height="70"><circle cx="35" cy="35" r="28" fill="none" stroke="var(--border)" stroke-width="5"/><circle cx="35" cy="35" r="28" fill="none" stroke="var(--green)" stroke-width="5" stroke-dasharray="${(active/total)*175.9} 175.9" stroke-linecap="round" transform="rotate(-90 35 35)"/></svg>
      <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-family:'Syne',sans-serif;font-size:18px;font-weight:800;color:var(--green)">${score}</div>
    </div>
    <div><div style="font-size:15px;font-weight:600;color:var(--green);margin-bottom:4px">Sistema ${score>=80?'seguro':'en riesgo'}</div><div style="font-size:12px;color:var(--text2);margin-bottom:4px">${active} / ${total} controles activos</div><div style="font-size:11px;color:var(--text3)">Última auditoría: hace 2 días</div></div>
    <div style="margin-left:auto;display:flex;flex-direction:column;gap:5px">
      ${[['✓ SOC 2','var(--green)'],['✓ ISO 27001','var(--accent2)'],['✓ GDPR','var(--green)']].map(([l,c])=>`<div style="font-size:10px;padding:3px 10px;border-radius:4px;background:${c}22;color:${c};font-weight:500">${l}</div>`).join('')}
    </div>
  </div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:20px">
    ${items.map(([ic,key,name,desc,col])=>`<div class="scard" id="sc-${key}">
      <div class="sic" style="background:${opts[key]?col+'22':'var(--surface2)'};color:${opts[key]?col:'var(--text3)'}">${ic}</div>
      <div style="flex:1"><div style="font-size:13px;font-weight:500;margin-bottom:2px">${name}</div><div style="font-size:11px;color:var(--text3)">${desc}</div></div>
      <div class="sw ${opts[key]?'on':''}" onclick="tSec('${key}','${col}',this)"><div class="sk"></div></div>
    </div>`).join('')}
  </div>
  <div class="card"><div style="font-size:13px;font-weight:600;margin-bottom:14px">📊 Log de seguridad</div>
    <div>${log.slice(0,8).map(l=>`<div style="display:flex;gap:10px;padding:8px 0;border-bottom:1px solid var(--border);font-size:12px"><div style="font-size:14px;width:20px;text-align:center">${l.icon}</div><div style="flex:1"><div style="font-weight:500">${l.title}</div><div style="font-size:10px;color:var(--text3)">${l.detail}</div></div><div style="font-size:10px;color:var(--text3)">${l.time}</div></div>`).join('')}</div>
  </div>`;
}
function tSec(key,col,el){const opts=DB.get('secopts')||{};opts[key]=!opts[key];DB.set('secopts',opts);el.classList.toggle('on',opts[key]);const c=document.getElementById('sc-'+key);if(c){const i=c.querySelector('.sic');if(i){i.style.background=opts[key]?col+'22':'var(--surface2)';i.style.color=opts[key]?col:'var(--text3)';}}addSecLog(opts[key]?'✅':'⚠️','Control',key+' → '+(opts[key]?'ON':'OFF'));toast((opts[key]?'🔒 ':'🔓 ')+key+' '+(opts[key]?'activado':'desactivado'));}

// PLANS
function rPlans(){
  return`<style>
  .pgrid{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-bottom:22px}
  .pcard{background:var(--bg2);border:1px solid var(--border);border-radius:var(--rl);padding:20px;position:relative;transition:all .2s}
  .pcard:hover{border-color:var(--border3);transform:translateY(-2px)}.pcard.feat{border-color:rgba(91,124,246,.4);background:rgba(91,124,246,.04)}
  .pbadge{position:absolute;top:-11px;left:50%;transform:translateX(-50%);background:linear-gradient(90deg,var(--accent),var(--purple));color:#fff;font-size:10px;padding:3px 12px;border-radius:20px;font-weight:600;white-space:nowrap}
  .pfeat{font-size:12px;color:var(--text2);padding:5px 0;display:flex;gap:7px}
  .agrid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
  .acard{background:var(--surface);border:1px solid var(--border);border-radius:var(--r);padding:13px;display:flex;gap:10px;align-items:flex-start;transition:border .15s}
  .acard:hover{border-color:var(--border3)}
  @media(max-width:700px){.pgrid,.agrid{grid-template-columns:1fr}}
  </style>
  <div class="ph"><div><div class="pt">Planes & Almacenamiento</div><div class="ps">Suscripción y complementos</div></div></div>
  <div class="pgrid">
    ${[['Free','0',false,['5 GB almacenamiento',null,'1 usuario',null,'Formatos básicos',null,'Soporte comunidad',null],'Empezar gratis'],['Pro','29',true,['50 GB almacenamiento','10 usuarios','Todos los formatos','API REST completa','Analytics avanzado','CDN global','Soporte prioritario','2FA avanzado'],'Plan actual'],['Enterprise','99',false,['Almacenamiento ilimitado','Usuarios ilimitados','SSO / LDAP / SAML','SLA 99.99%','Onboarding dedicado','Soporte 24/7','Audit logs avanzados','Custom branding'],'Contactar ventas']].map(([name,price,feat,feats,cta])=>`
    <div class="pcard ${feat?'feat':''}">
      ${feat?'<div class="pbadge">✨ Plan actual</div>':''}
      <div style="font-size:11px;font-weight:600;color:var(--text3);text-transform:uppercase;letter-spacing:.5px;margin-bottom:10px">${name}</div>
      <div style="font-family:'Syne',sans-serif;font-size:30px;font-weight:800;letter-spacing:-1px;margin-bottom:2px">$${price}<span style="font-size:14px;font-weight:400;color:var(--text3)">/mes</span></div>
      <div style="font-size:11px;color:var(--text3);margin-bottom:16px">${name==='Pro'?'Anual — ahorra 20%':name==='Enterprise'?'Precio personalizado':'Sin tarjeta requerida'}</div>
      <div style="margin-bottom:18px">${feats.map(f=>f?`<div class="pfeat"><span style="color:var(--green)">✓</span>${f}</div>`:`<div class="pfeat"><span style="color:var(--text4)">–</span><span style="color:var(--text4)">No incluido</span></div>`).join('')}</div>
      <button class="btn ${feat?'btn-p':'btn-g'} btn-full" onclick="toast('💳 Redirigiendo...')">${cta}</button>
    </div>`).join('')}
  </div>
  <div class="card" style="margin-bottom:16px"><div style="font-size:13px;font-weight:600;margin-bottom:14px">⚡ Complementos</div>
    <div class="agrid">
      ${[['🤖','IA Auto-tagging','$9/mes','Tags automáticos con visión IA'],['📦','Storage +50 GB','$12/mes','Amplía tu almacenamiento'],['🌐','CDN Premium','$19/mes','Entrega 150+ países'],['🔌','API Avanzada','$15/mes','Rate limits + Webhooks'],['📊','Analytics Pro','$9/mes','Reportes + heatmaps'],['🔏','Firma digital','$12/mes','Certificación de assets'],['🎨','Editor','$19/mes','Edición básica integrada'],['🔄','Sync Drive','$9/mes','Google Drive / Dropbox']].map(([ic,n,p,d])=>`
      <div class="acard"><div style="font-size:22px;flex-shrink:0">${ic}</div><div style="flex:1;min-width:0"><div style="font-size:12px;font-weight:500;margin-bottom:2px">${n}</div><div style="font-size:10px;color:var(--text3)">${d}</div></div><button class="btn btn-g" style="font-size:11px;padding:4px 9px;flex-shrink:0" onclick="toast('➕ Agregado')">${p}</button></div>`).join('')}
    </div>
  </div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
    <div class="card"><div style="font-size:13px;font-weight:600;margin-bottom:12px">💳 Facturación</div>
      ${[['Plan','Pro — $29/mes','var(--accent2)'],['Próx. cobro','2024-02-01',''],['Método','•••• 4242',''],['Ciclo','Anual (-20%)','']].map(([k,v,col])=>`<div class="irow"><div class="ikey">${k}</div><div class="ival" style="color:${col||'var(--text2)'}">${v}</div></div>`).join('')}
      <button class="btn btn-g" style="font-size:11px;margin-top:10px;width:100%" onclick="toast('📄 Facturas...')">Ver historial</button>
    </div>
    <div class="card"><div style="font-size:13px;font-weight:600;margin-bottom:12px">📊 Uso del plan</div>
      ${[['Storage','3.7/50 GB',7],['Usuarios','4/10',40],['API calls','12,840/100k',13],['Webhooks','2/10',20]].map(([l,v,p])=>`<div style="margin-bottom:10px"><div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:3px"><span style="color:var(--text2)">${l}</span><span style="font-family:'JetBrains Mono',monospace;color:var(--text3)">${v}</span></div><div style="height:4px;background:var(--border);border-radius:2px;overflow:hidden"><div style="height:100%;background:var(--accent);border-radius:2px;width:${p}%"></div></div></div>`).join('')}
    </div>
  </div>`;
}

// COLLECTIONS
function rColl(){
  const colls=DB.get('collections')||[];
  return`<div class="ph"><div><div class="pt">Colecciones</div><div class="ps">${colls.length} colecciones activas</div></div><div class="pa"><button class="btn btn-p" onclick="newColl()">+ Nueva</button></div></div>
  <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px">
    ${colls.map(c=>`<div style="background:var(--bg2);border:1px solid var(--border);border-radius:var(--rl);padding:18px;cursor:pointer;transition:all .2s" onmouseover="this.style.borderColor='var(--border3)';this.style.transform='translateY(-2px)'" onmouseout="this.style.borderColor='var(--border)';this.style.transform='none'" onclick="toast('📂 ${c.name}')">
      <div style="width:46px;height:46px;border-radius:12px;background:${c.color}22;display:flex;align-items:center;justify-content:center;font-size:22px;margin-bottom:12px">${c.icon}</div>
      <div style="font-size:13px;font-weight:600;margin-bottom:3px">${c.name}</div>
      <div style="font-size:11px;color:var(--text3);margin-bottom:10px">${c.count} imgs · ${c.created}</div>
      <div style="display:flex;gap:6px">
        <button class="btn btn-g" style="font-size:11px;padding:4px 9px;flex:1" onclick="event.stopPropagation();toast('✏ Editando')">✏</button>
        <button class="btn btn-g" style="font-size:11px;padding:4px 9px" onclick="event.stopPropagation();openShare('col-${c.id}',event)">🔗</button>
        <button class="btn btn-d" style="font-size:11px;padding:4px 9px" onclick="event.stopPropagation();delColl('${c.id}')">🗑</button>
      </div>
    </div>`).join('')}
    <div style="background:var(--bg2);border:2px dashed var(--border3);border-radius:var(--rl);min-height:160px;display:flex;flex-direction:column;align-items:center;justify-content:center;cursor:pointer;transition:all .2s" onmouseover="this.style.borderColor='var(--accent)';this.style.background='var(--adim)'" onmouseout="this.style.borderColor='var(--border3)';this.style.background='var(--bg2)'" onclick="newColl()">
      <div style="font-size:32px;opacity:.3;margin-bottom:8px">+</div><div style="font-size:13px;color:var(--text3)">Nueva colección</div>
    </div>
  </div>`;
}
function newColl(){const name=prompt('Nombre:');if(!name)return;const colls=DB.get('collections')||[];const icons=['📁','🎯','🎨','📦','🌟','💎','🔥','✨'];const colors=['#5b7cf6','#1fdb8a','#b06ef5','#f4a832','#22d3ee','#f05252'];colls.push({id:'c'+Date.now(),name,icon:icons[~~(Math.random()*icons.length)],color:colors[~~(Math.random()*colors.length)],count:0,owner:CU?.id||'u1',created:new Date().toISOString().slice(0,10)});DB.set('collections',colls);nav('collections');toast('✅ "'+name+'" creada');}
function delColl(id){const colls=DB.get('collections')||[];const c=colls.find(x=>x.id===id);if(!c)return;DB.set('collections',colls.filter(x=>x.id!==id));nav('collections');toast('🗑 Colección eliminada');}

// SHARED
function rShared(){
  const shared=DB.get('shared')||[];const users=DB.get('users')||[];
  return`<style>
  .stbl2{background:var(--bg2);border:1px solid var(--border);border-radius:var(--rl);overflow:hidden}
  .sth2,.str2{padding:10px 14px;display:grid;grid-template-columns:2fr 1fr 70px 100px 80px 90px;gap:10px;align-items:center;font-size:12px}
  .sth2{border-bottom:1px solid var(--border);font-size:10px;font-weight:600;color:var(--text3);text-transform:uppercase;letter-spacing:.6px}
  .str2{border-bottom:1px solid var(--border);transition:background .15s;cursor:pointer}.str2:last-child{border-bottom:none}.str2:hover{background:var(--surface)}
  @media(max-width:700px){.sth2,.str2{grid-template-columns:2fr 80px 90px}.sth2>*:nth-child(n+3):not(:nth-child(3)):not(:nth-child(6)),.str2>*:nth-child(n+3):not(:nth-child(3)):not(:nth-child(6)){display:none}}
  </style>
  <div class="ph"><div><div class="pt">Compartidos</div><div class="ps">${shared.length} enlaces · ${shared.filter(s=>s.status==='active').length} activos</div></div>
  <div class="pa"><button class="btn btn-d" style="font-size:12px" onclick="revokeAll()">⛔ Revocar todos</button><button class="btn btn-p" onclick="nav('library')">+ Nuevo</button></div></div>
  <div class="stbl2">
    <div class="sth2"><div>Archivo</div><div>Por</div><div>Vistas</div><div>Expira</div><div>Estado</div><div>Acciones</div></div>
    ${shared.length?shared.map(s=>{const ow=users.find(u=>u.id===s.by);return`<div class="str2">
      <div style="font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${s.name}</div>
      <div style="font-size:11px;color:var(--text2)">${ow?ow.first+' '+ow.last[0]+'.':'—'}</div>
      <div style="font-weight:500">${s.views}</div>
      <div style="font-size:11px;color:var(--text3);font-family:'JetBrains Mono',monospace">${s.exp==='never'?'∞':s.exp}</div>
      <div><span style="font-size:10px;padding:3px 8px;border-radius:4px;background:${s.status==='active'?'var(--gdim)':'var(--rdim)'};color:${s.status==='active'?'var(--green)':'var(--red)'}">${s.status==='active'?'Activo':'Expirado'}</span></div>
      <div style="display:flex;gap:4px"><button class="btn btn-g" style="font-size:10px;padding:3px 7px" onclick="copyLnk('${s.link}')">Copiar</button><button class="btn btn-d" style="font-size:10px;padding:3px 7px" onclick="rvkLink('${s.id}')">✕</button></div>
    </div>`;}).join(''):`<div class="empty" style="padding:40px"><div class="empty-ic">🔗</div><div class="empty-t">Sin enlaces</div></div>`}
  </div>
  <div class="card" style="margin-top:16px"><div style="font-size:13px;font-weight:600;margin-bottom:12px">📊 Resumen</div>
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px">
      ${[['🔗',shared.length,'Total'],['✅',shared.filter(s=>s.status==='active').length,'Activos'],['👁',shared.reduce((a,s)=>a+s.views,0),'Vistas'],['⛔',shared.filter(s=>s.status==='expired').length,'Expirados']].map(([ic,val,lbl])=>`<div style="background:var(--surface);border-radius:var(--r);padding:12px;text-align:center"><div style="font-size:18px;margin-bottom:4px">${ic}</div><div style="font-family:'Syne',sans-serif;font-size:20px;font-weight:700;margin-bottom:2px">${val}</div><div style="font-size:10px;color:var(--text3)">${lbl}</div></div>`).join('')}
    </div>
  </div>`;
}
function copyLnk(url){navigator.clipboard?.writeText(url).catch(()=>{});toast('🔗 Enlace copiado');}
function rvkLink(id){const s=DB.get('shared')||[];DB.set('shared',s.filter(x=>x.id!==id));nav('shared');toast('🔗 Revocado');}
function revokeAll(){if(!confirm('¿Revocar todos los enlaces?'))return;DB.set('shared',[]);nav('shared');toast('⛔ Todos revocados');}

// API
function rAPI(){
  const keys=DB.get('apikeys')||[];const hooks=DB.get('webhooks')||[];
  return`<style>
  .akrow{background:var(--surface);border:1px solid var(--border);border-radius:var(--r);padding:12px 14px;display:flex;align-items:center;gap:10px;margin-bottom:8px}
  .akv{flex:1;color:var(--text2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-family:'JetBrains Mono',monospace;font-size:11px}
  .eprow{background:var(--surface);border-radius:var(--r);padding:11px 14px;margin-bottom:8px;display:flex;align-items:center;gap:10px;font-size:12px;cursor:pointer;transition:background .15s}
  .eprow:hover{background:var(--surface2)}.wrow{background:var(--surface);border-radius:var(--r);padding:11px 14px;margin-bottom:8px;display:flex;align-items:center;gap:10px;font-size:12px}
  .mth{font-family:'JetBrains Mono',monospace;font-size:10px;padding:2px 7px;border-radius:4px;font-weight:600;flex-shrink:0}
  .mget{background:var(--gdim);color:var(--green)}.mpost{background:var(--adim);color:var(--accent2)}.mdel{background:var(--rdim);color:var(--red)}.mput{background:var(--adim2);color:var(--amber)}
  </style>
  <div class="ph"><div><div class="pt">API & Webhooks</div><div class="ps">Integra DAMvault con tus apps</div></div><div class="pa"><button class="btn btn-p" onclick="newKey()">+ Nueva API Key</button></div></div>
  <div class="tabs" id="apiTabs"><div class="tab on" onclick="swTab(this,'tk')">🔑 API Keys</div><div class="tab" onclick="swTab(this,'th')">🔔 Webhooks</div><div class="tab" onclick="swTab(this,'te')">📋 Endpoints</div><div class="tab" onclick="swTab(this,'td')">📚 Docs</div></div>
  <div id="tk">
    ${keys.map(k=>`<div class="akrow"><div style="flex:0 0 auto"><div style="font-size:12px;font-weight:500;color:var(--text);margin-bottom:2px">${k.name}</div><div style="font-size:10px;color:var(--text3)">${k.calls.toLocaleString()} calls · ${k.created}</div></div><div class="akv">${k.key}</div><button class="btn btn-g" style="font-size:11px;padding:4px 9px" onclick="copyLnk('${k.key}')">Copiar</button><button class="btn btn-d" style="font-size:11px;padding:4px 9px" onclick="rvkKey('${k.id}')">Revocar</button></div>`).join('')}
    <div class="card" style="margin-top:14px"><div style="font-size:13px;font-weight:500;margin-bottom:8px">💡 Ejemplo</div>
      <div style="background:var(--bg3);border-radius:var(--r);padding:14px;font-family:'JetBrains Mono',monospace;font-size:11px;color:var(--text2);line-height:1.8;overflow-x:auto"><span style="color:var(--text3)">// Subir imagen</span><br><span style="color:var(--accent2)">const</span> res = <span style="color:var(--green)">await</span> fetch(<span style="color:var(--amber)">'https://api.damvault.io/v1/images'</span>, {<br>&nbsp;&nbsp;method: <span style="color:var(--amber)">'POST'</span>,<br>&nbsp;&nbsp;headers: { <span style="color:var(--amber)">'Authorization'</span>: <span style="color:var(--amber)">'Bearer ${keys[0]?.key?.slice(0,16)||'dvk_prod_...'}...'</span> },<br>&nbsp;&nbsp;body: formData<br>});<br><span style="color:var(--accent2)">const</span> { id, url } = <span style="color:var(--green)">await</span> res.json();</div>
    </div>
  </div>
  <div id="th" style="display:none">${hooks.map(h=>`<div class="wrow"><div style="width:8px;height:8px;border-radius:50%;background:${h.status==='active'?'var(--green)':'var(--border3)'}"></div><div style="flex:1"><div style="font-family:'JetBrains Mono',monospace;font-size:11px;color:var(--text2)">${h.url}</div><div style="font-size:10px;color:var(--text3)">Eventos: ${h.events.join(', ')}</div></div><button class="btn btn-g" style="font-size:11px;padding:4px 9px" onclick="toast('🧪 Test')">Test</button><button class="btn btn-d" style="font-size:11px;padding:4px 9px" onclick="toast('🗑 Eliminado')">✕</button></div>`).join('')}<button class="btn btn-g" style="margin-top:10px" onclick="toast('➕ Webhook')">+ Agregar</button></div>
  <div id="te" style="display:none">${[['GET','/v1/images','Listar imágenes'],['GET','/v1/images/:id','Obtener por ID'],['POST','/v1/images','Subir imagen'],['PUT','/v1/images/:id','Actualizar metadata'],['DELETE','/v1/images/:id','Eliminar'],['GET','/v1/collections','Listar colecciones'],['POST','/v1/collections','Crear colección'],['POST','/v1/share','Crear enlace'],['GET','/v1/users','Listar usuarios'],['GET','/v1/analytics','Métricas']].map(([m,p,d])=>`<div class="eprow" onclick="toast('${m} ${p}')"><span class="mth m${m.toLowerCase()}">${m}</span><span style="font-family:'JetBrains Mono',monospace;color:var(--text2);flex:1;font-size:11px">${p}</span><span style="font-size:11px;color:var(--text3)">${d}</span></div>`).join('')}</div>
  <div id="td" style="display:none"><div class="card"><div style="font-size:13px;font-weight:600;margin-bottom:12px">📚 Documentación</div>
    ${[['🚀','Inicio rápido','5 minutos para empezar'],['🔐','Auth','API Keys y OAuth 2.0'],['📁','Assets','Upload, metadata, versioning'],['👥','Usuarios','Roles, RBAC, SSO'],['📊','Analytics','Métricas y eventos'],['🔔','Webhooks','Eventos y seguridad HMAC']].map(([ic,t,d])=>`<div style="display:flex;gap:10px;padding:10px;border-radius:var(--r);cursor:pointer;transition:background .15s;margin-bottom:4px" onmouseover="this.style.background='var(--surface)'" onmouseout="this.style.background='transparent'" onclick="toast('📖 ${t}')"><span style="font-size:18px">${ic}</span><div><div style="font-size:12px;font-weight:500;margin-bottom:2px">${t}</div><div style="font-size:11px;color:var(--text3)">${d}</div></div><span style="margin-left:auto;color:var(--text3)">→</span></div>`).join('')}
  </div></div>`;
}
function swTab(el,id){const tabs=document.getElementById('apiTabs');if(tabs)tabs.querySelectorAll('.tab').forEach(t=>t.classList.remove('on'));el.classList.add('on');['tk','th','te','td'].forEach(x=>{const e=document.getElementById(x);if(e)e.style.display='none';});const t=document.getElementById(id);if(t)t.style.display='block';}
function newKey(){const name=prompt('Nombre para la API key:');if(!name)return;const keys=DB.get('apikeys')||[];keys.push({id:'k'+Date.now(),name,key:'dvk_'+Math.random().toString(36).slice(2,10)+'_'+Math.random().toString(36).slice(2,10),created:new Date().toISOString().slice(0,10),calls:0,status:'active'});DB.set('apikeys',keys);nav('api');toast('🔑 "'+name+'" creada');}
function rvkKey(id){DB.set('apikeys',(DB.get('apikeys')||[]).filter(k=>k.id!==id));nav('api');toast('⛔ Key revocada');}

// TRASH
function rTrash(){
  const trash=DB.get('trash')||[];
  return`<div class="ph"><div><div class="pt">Papelera</div><div class="ps">Archivos eliminados permanentemente tras 30 días</div></div><div class="pa">${trash.length?`<button class="btn btn-d" onclick="emptyTrash()">🗑 Vaciar</button>`:''}</div></div>
  ${trash.length?`<div class="card">${trash.map(t=>`
    <div style="display:flex;align-items:center;gap:12px;padding:11px 0;border-bottom:1px solid var(--border)">
      <div style="width:44px;height:44px;border-radius:7px;background:var(--surface);display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0">${t.fmt==='SVG'?'🎨':t.fmt==='PNG'?'🖼':'📷'}</div>
      <div style="flex:1;min-width:0"><div style="font-size:12px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${t.name}</div><div style="font-size:10px;color:var(--text3);margin-top:2px">${t.size} · ${t.fmt} · ${t.deleted}</div></div>
      <div style="font-size:10px;color:var(--amber);flex-shrink:0;white-space:nowrap">${t.days} días</div>
      <div style="display:flex;gap:6px;flex-shrink:0">
        <button class="btn btn-s" style="font-size:11px;padding:5px 10px" onclick="restoreT('${t.id}')">↩ Restaurar</button>
        <button class="btn btn-d" style="font-size:11px;padding:5px 10px" onclick="permDel('${t.id}')">✕</button>
      </div>
    </div>`).join('')}</div>`:`<div class="empty"><div class="empty-ic">🗑</div><div class="empty-t">Papelera vacía</div><div class="empty-s">Los archivos eliminados aparecen aquí 30 días antes de borrarse permanentemente.</div></div>`}`;
}
function restoreT(id){const trash=DB.get('trash')||[];const item=trash.find(t=>t.id===id);if(!item)return;DB.set('trash',trash.filter(t=>t.id!==id));const imgs=DB.get('images')||[];imgs.unshift({id:'i'+Date.now(),name:item.name,size:item.size,dims:'Restaurado',fmt:item.fmt,tags:['restaurado'],folder:'General',color:'#5b7cf6',user:CU?.id||'u1',date:new Date().toISOString().slice(0,10),desc:'Restaurado de papelera',lic:'Uso interno',versions:[{v:1,date:new Date().toISOString().slice(0,10),size:item.size,note:'Restaurado de papelera'}]});DB.set('images',imgs);nav('trash');updateBadges();toast('✅ '+item.name+' restaurado');}
function permDel(id){const trash=DB.get('trash')||[];const item=trash.find(t=>t.id===id);DB.set('trash',trash.filter(t=>t.id!==id));nav('trash');updateBadges();toast('🗑 '+item?.name+' eliminado permanentemente');}
function emptyTrash(){if(!confirm('¿Vaciar la papelera? No se puede deshacer.'))return;DB.set('trash',[]);nav('trash');updateBadges();toast('🗑 Papelera vaciada');}
