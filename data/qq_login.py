"""QQ音乐扫码登录，保存凭证"""
import asyncio, json, time
from qqmusic_api import Client
from qqmusic_api.modules.login import QRLoginType

async def main():
    api = Client()
    qr = await api.login.get_qrcode(QRLoginType.QQ)
    qr.save("C:/Users/Administrator/Desktop/ai 电台/radio-repo/data/qq_qrcode.png")
    print("二维码已保存，用QQ扫描登录...")

    for i in range(120):
        result = await api.login.check_qrcode(qr)
        if result.done:
            if result.credential:
                with open("C:/Users/Administrator/Desktop/ai 电台/radio-repo/data/qq_credential.json", "w") as f:
                    json.dump(result.credential.model_dump(), f, ensure_ascii=False, indent=2)
                print("登录成功！凭证已保存")
                return
            print("扫码完成但未获取凭证")
            return
        time.sleep(1)

    print("扫码超时")

asyncio.run(main())
