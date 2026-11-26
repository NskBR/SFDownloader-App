import {render,screen,fireEvent,cleanup} from "@testing-library/react";
import {it,expect,afterEach} from "vitest";
import {TorrentPeerDetails,peerRatio,sortPeerDetails,type PeerDetail} from "./TorrentPeerDetails";
afterEach(cleanup);
const peer=(progress:number|null,received:number,rate:number):PeerDetail=>({client_name:"Client",state:"live",conn_kind:"tcp",progress_percent:progress,encrypted:null,downloadRate:rate,uploadRate:1,counters:{fetched_bytes:received,uploaded_bytes:50,errors:0,connections:1,incoming_connections:0}});
it("sorts measured rates, progress and transferred totals independently",()=>{
 const peers={a:peer(100,10,1),b:peer(40,20,5),c:peer(null,30,0)};
 expect(sortPeerDetails(peers,"download").map(([id])=>id)).toEqual(["b","a","c"]);
 expect(sortPeerDetails(peers,"progress").map(([id])=>id)).toEqual(["a","b","c"]);
 expect(sortPeerDetails(peers,"received").map(([id])=>id)).toEqual(["c","b","a"]);
 expect(peerRatio(100,50)).toBe("0.50");expect(peerRatio(0,50)).toBe("∞");expect(peerRatio(0,0)).toBe("—");
});
it("shows seeders, leechers and unknown availability without inferring encryption",()=>{
 render(<TorrentPeerDetails details={{active:true,peers:{a:peer(100,10,1),b:peer(40,20,5),c:peer(null,30,0)}}} error={false} formatBytes={n=>`${n} B`}/>);
 expect(screen.getByText("Seeder")).toBeTruthy();expect(screen.getByText("Leecher")).toBeTruthy();expect(screen.getByText("Não identificado")).toBeTruthy();expect(screen.getAllByText("Não disponível")).toHaveLength(3);
 fireEvent.change(screen.getByRole("combobox",{name:"Ordenar peers"}),{target:{value:"progress"}});
 expect(screen.getByText("a").closest(".torrent-peer-detail")?.previousElementSibling?.className).toBe("torrent-peers-heading");
});
