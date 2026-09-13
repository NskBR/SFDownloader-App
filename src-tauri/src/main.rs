#![allow(linker_messages)]
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    sf_downloader_lib::run();
}
