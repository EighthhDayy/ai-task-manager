# utils = utilities（实用工具、辅助功能）


# io 是 Input / Output（输入 / 输出） 的缩写。
# Python 自带 io 模块，用于处理输入输出流。
# BytesIO: Bytes：字节数据   IO：输入 / 输出
# 作用是：把内存中的 bytes 数据包装成一个像文件一样、可以读取和定位的对象
from io import BytesIO

import pymupdf      # PDF 处理库	把 PDF 页面渲染成图片
import pytesseract     # Tesseract 的 Python 封装	调用 OCR 引擎识别图片里的文字

from PIL import Image   # Pillow 图片处理工具	打开渲染出来的 PNG 图片
from pypdf import PdfReader   # PDF 解析器	读取 PDF 页面，直接提取文字
from pypdf.errors import PdfReadError   # PDF 读取异常	处理一部分 PDF 解析错误


def extract_pdf_pages(pdf_bytes: bytes) -> list[tuple[int, str]]:
    """Extract nonempty pages with their original one-based PDF page numbers."""
    if not pdf_bytes.startswith(b"%PDF-"):
        raise ValueError("Invalid PDF file")

    try:
        # BytesIO 把内存中的二进制数据包装成一个类似文件的对象，
        # 让 PdfReader 能读取它，而不需要先把 PDF 保存到硬盘
        # 使用 PdfReader 解析这份 PDF
        reader = PdfReader(BytesIO(pdf_bytes))

        if reader.is_encrypted: # encrypted = 已加密的
            raise ValueError("Encrypted PDFs are not supported")

        if len(reader.pages) > 30:  # 表示 PDF 的页面集合
            raise ValueError("PDF exceeds 30 pages")

        pages = []
        ocr_page_count = 0   # 记录已经触发过OCR 的页面数量

        with pymupdf.open(      # PyMuPDF，这里主要负责把页面渲染成图片
            stream=pdf_bytes,   # 一段供程序读取的数据流：PyMuPDF，请从这段 PDF 字节数据中打开文档。
            filetype="pdf",     # 输入的数据按照 PDF 格式来解析
        ) as pdf:               # 打开得到的文档对象绑定到变量 pdf  pdf = pymupdf.open(...)

            for i, page in enumerate(reader.pages):

                # 优先提取 PDF 自带的文字

                # page.extract_text()  核心操作：提取页面中已有的文字
                # page是页面对象
                # .extract_text() 从这一页 PDF 中提取可以识别的文本
                # or ""：如果左边返回 None 或空字符串，就使用右边的 ""
                page_text = (page.extract_text() or "").strip()

                 # 如果这一页没有可提取的文字，尝试 OCR
                if not page_text:
                    ocr_page_count += 1

                    if ocr_page_count > 10:
                        raise ValueError(
                            "PDF exceeds 10 OCR pages"
                        )

                    # PDF 页面 -> 图片
                    # pdf[i]：相同页码对应的 PyMuPDF 页面对象

                    # get_pixmap() 的作用是：把整张 PDF 页面渲染为由像素构成的图像。
                    pix = pdf[i].get_pixmap(    # pixmap 来自 pixel map，可以理解成像素图
                        dpi=180,        # DPI = Dots Per Inch，每英寸点数。DPI 越高，通常文字细节会越清楚，但图像也会更大，处理会更慢、占用更多内存
                        alpha=False,    # 对普通的白底 PDF 页面 OCR 来说，通常没有必要保留透明度
                    )
                    # 执行完以后，pix 就保存了当前 PDF 页面的像素图对象

                    image_bytes = pix.tobytes("png")    # 把像素图编码成 PNG 格式的字节数据，里面是 PNG 图片的二进制内容

                    # 图片 -> OCR 文字
                    # 使用 Pillow 打开这份 PNG 图片数据，得到一个 Pillow 图像对象
                    with Image.open(BytesIO(image_bytes)) as image:
                        page_text = pytesseract.image_to_string(    # 使用 Tesseract OCR，将图片上识别到的文字转换成一个 Python 字符串
                            image,
                            lang="eng",
                            timeout=20,     # 限制这一次 OCR 调用的执行时间为最多约 20 秒
                        ).strip()

                    # PyMuPDF 把 PDF 页面变成图片。Tesseract 才是真正识别图片中文字的工具

                if page_text:
                    pages.append((i + 1, page_text))

    # 把捕获到的异常对象保存到变量 exc 里。exc 是 exception（异常）的缩写
    except (PdfReadError, pymupdf.FileDataError) as exc:
        raise ValueError("PDF is damaged or unsupported") from exc      # 这个新异常，是由刚刚捕获的原始异常引起的

    if not pages:
        raise ValueError(
            "No text could be extracted, including by OCR"
        )

    if sum(len(text) for _, text in pages) + 2 * (len(pages) - 1) > 100_000:
        raise ValueError("Extracted text is too long")

    return pages


def extract_pdf_text(pdf_bytes: bytes) -> str:
    return "\n\n".join(text for _, text in extract_pdf_pages(pdf_bytes))


# 用户上传 PDF
#       ↓
# 得到 PDF 的二进制数据（bytes）
#       ↓
# 检查是不是 PDF 格式
#       ↓
# 创建 PDF 阅读器 PdfReader
#       ↓
# 检查有没有加密
#       ↓
# 检查有没有超过 30 页
#       ↓
# 逐页提取文本
#       ↓
# 清理每页首尾的空白
#       ↓
# 把各页文本拼接起来
#       ↓
# 检查有没有文字、文字是否过长
#       ↓
# 返回一个大字符串 str
