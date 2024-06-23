#pragma once
#include <stdint.h>
#include <atomic>
#include "guid.h"

namespace tsstg
{
    class IUnknown
    {
        DEFINE_INTERFACE_GUID(0xb6a3e64ce75c8230ULL, 0xb382c010acdeb7cfULL);

    public:
        virtual ~IUnknown() {}
        virtual uint32_t AddRef() = 0;
        virtual uint32_t Release() = 0;
        virtual bool QueryInterface(const GUID& guid, void** ppv) = 0;
    };

    template<class T> class ComPtr
    {
        T* mPtr;

    public:
        ComPtr()
        {
            mPtr = nullptr;
        }

        ComPtr(T* ptr) : ComPtr()
        {
            mPtr = ptr;
            if (mPtr)
            {
                mPtr->AddRef();
            }
        }

        template<class TP, class = class std::enable_if<std::is_convertible<TP*, T*>::value>::type>
        ComPtr(TP* val) noexcept : ComPtr()
        {
            ptr->QueryInterface(GUID_OF(T), reinterpret_cast<void**>(&mPtr));
        }

        ComPtr(const ComPtr<T>& val) noexcept : ComPtr()
        {
            mPtr = val.mPtr;
            if (mPtr)
            {
                mPtr->AddRef();
            }
        }

        template<class TP, class = class std::enable_if<std::is_convertible<TP*, T*>::value>::type>
        ComPtr(const ComPtr<TP>& val) noexcept : ComPtr()
        {
            val->QueryInterface(GUID_OF(T), reinterpret_cast<void**>(&mPtr));
        }

        ComPtr(ComPtr<T>&& val) noexcept : ComPtr()
        {
            mPtr = val.mPtr;
            val.mPtr = nullptr;
        }

        template<class TP, class = class std::enable_if<std::is_convertible<TP*, T*>::value>::type>
        ComPtr(ComPtr<TP>&& val) noexcept : ComPtr()
        {
            val->QueryInterface(GUID_OF(T), reinterpret_cast<void**>(&mPtr));
            val.Reset();
        }

        ~ComPtr()
        {
            Reset();
        }

        ComPtr<T>& operator=(const ComPtr<T>& val)
        {
            T* oldPtr = mPtr;
            mPtr = val.mPtr;
            if (mPtr)
            {
                mPtr->AddRef();
            }
            if (oldPtr)
            {
                oldPtr->Release();
            }
            return *this;
        }

        template<class TP, class = class std::enable_if<std::is_convertible<TP*, T*>::value>::type>
        ComPtr<T>& operator=(const ComPtr<TP>& val)
        {
            T* oldPtr = mPtr;
            val->QueryInterface(GUID_OF(T), reinterpret_cast<void**>(&mPtr));
            if (oldPtr)
            {
                oldPtr->Release();
            }
            return *this;
        }

        ComPtr<T>& operator=(T* val)
        {
            T* oldPtr = mPtr;
            mPtr = val;
            if (mPtr)
            {
                mPtr->AddRef();
            }
            if (oldPtr)
            {
                oldPtr->Release();
            }
            return *this;
        }

        template<class TP, class = class std::enable_if<std::is_convertible<TP*, T*>::value>::type>
        ComPtr<T>& operator=(TP* val)
        {
            T* oldPtr = mPtr;
            val->QueryInterface(GUID_OF(T), reinterpret_cast<void**>(&mPtr));
            if (oldPtr)
            {
                oldPtr->Release();
            }
            return *this;
        }

        friend bool operator!=(const ComPtr<T>& lhs, const ComPtr<T>& rhs)
        {
            return !(lhs.mPtr == rhs.mPtr);
        }

        friend bool operator!=(T* lhs, const ComPtr<T>& rhs)
        {
            return !(lhs == rhs.mPtr);
        }

        friend bool operator!=(const ComPtr<T>& lhs, T* rhs)
        {
            return !(lhs.mPtr == rhs);
        }

        friend bool operator==(const ComPtr<T>& lhs, T* rhs)
        {
            return lhs.mPtr == rhs;
        }

        friend bool operator==(T* lhs, const ComPtr<T>& rhs)
        {
            return lhs == rhs.mPtr;
        }

        friend bool operator==(const ComPtr<T>& lhs, const ComPtr<T>& rhs)
        {
            return (lhs.mPtr == rhs.mPtr);
        }

        friend bool operator<(const ComPtr<T>& lhs, const ComPtr<T>& rhs)
        {
            return (lhs.mPtr < rhs.mPtr);
        }

        inline T** operator&()
        {
            Reset();
            return &mPtr;
        }

        inline bool IsValid() const
        {
            return mPtr != nullptr;
        }

        inline operator bool() const
        {
            return IsValid();
        }

        inline T* operator->() const
        {
            return mPtr;
        }

        inline T* Get() const
        {
            return mPtr;
        }

        template<class TP>
        bool As(TP** val)
        {
            if (!mPtr)
            {
                *val = nullptr;
                return false;
            }
            return mPtr->QueryInterface(GUID_OF(TP), reinterpret_cast<void**>(val));
        }

        void Reset()
        {
            if (mPtr)
            {
                mPtr->Release();
            }
            mPtr = nullptr;
        }
    };
} // namespace tsstg