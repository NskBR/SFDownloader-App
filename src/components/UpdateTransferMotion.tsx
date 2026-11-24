import logo from "../assets/sf-logo.svg";
import "../styles/update-transfer-motion.css";

export function UpdateTransferMotion() {
  return <svg className="update-transfer-motion" viewBox="0 0 340 130" aria-hidden="true" focusable="false">
    <path className="update-transfer-route" d="M75 65C110 16 225 16 265 65"/>
    <g className="update-transfer-folder update-transfer-folder-source"><path d="M28 57V42a7 7 0 0 1 7-7h20l9 9h34a7 7 0 0 1 7 7v43H28Z"/><path d="M25 56h82l-8 42H31Z"/><path className="update-transfer-download" d="M65 65v21m-8-8 8 8 8-8"/></g>
    {[0,1,2].map(index=><g key={index} transform="translate(58 47)"><g className={`update-transfer-file update-transfer-file-${index}`}><path d="M0 0h17l9 9v25H0Z"/><path d="M17 0v9h9M6 17h14M6 23h11"/></g></g>)}
    <g className="update-transfer-folder update-transfer-folder-destination"><path d="M235 57V42a7 7 0 0 1 7-7h20l9 9h34a7 7 0 0 1 7 7v43h-77Z"/><path d="M232 56h82l-8 42h-68Z"/></g>
    <image href={logo} x="257" y="63" width="31" height="28"/>
    <path className="update-transfer-floor" d="M35 106h62m145 0h62"/>
  </svg>;
}
