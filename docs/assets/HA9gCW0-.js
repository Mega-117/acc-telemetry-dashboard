const r=new Set(["pilot","coach","admin"]);function t(n,e){return n==="hud"?e.isAdmin===!0||r.has(String(e.role||"")):!1}export{t as c};
